const logger = require('../utils/logger');
const { verifyChatToken } = require('../utils/chatToken');
const pool = require('../config/database');

module.exports = (io) => {
  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const user = verifyChatToken(token);
      socket.data.user = user;
      next();
    } catch (error) {
      next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    logger.info('Client connected', {
      socketId: socket.id,
      userId: user.sub,
      role: user.role,
      companyId: user.company_id
    });

    socket.emit('support:connected', {
      ok: true,
      user_id: user.sub,
      role: user.role,
      company_id: user.company_id
    });

    // Join rooms
    socket.join(`user:${user.sub}`);
    if (user.company_id) {
      socket.join(`company:${user.company_id}`);
    }
    if (user.role === 'admin' || user.role === 'support') {
      socket.join('support:staff');
    }

    // support:conversation:join
    socket.on('support:conversation:join', async (data) => {
      try {
        const { conversation_id } = data;
        if (!conversation_id) {
          return socket.emit('support:error', { message: 'conversation_id required' });
        }

        // Check access
        if (user.role === 'user') {
          const [conv] = await pool.execute('SELECT user_id FROM support_conversations WHERE id = ?', [conversation_id]);
          if (conv.length === 0 || conv[0].user_id !== user.sub) {
            return socket.emit('support:error', { message: 'Access denied' });
          }
        }

        socket.join(`conversation:${conversation_id}`);
        socket.emit('support:conversation:joined', { conversation_id });
      } catch (error) {
        logger.error('Error joining conversation', { error: error.message, socketId: socket.id });
        socket.emit('support:error', { message: 'Failed to join conversation' });
      }
    });

    // support:typing
    socket.on('support:typing', (data) => {
      try {
        const { conversation_id, is_typing } = data;
        if (!conversation_id) {
          return socket.emit('support:error', { message: 'conversation_id required' });
        }

        // Broadcast to conversation room excluding sender
        io.to(`conversation:${conversation_id}`).except(socket.id).emit('support:typing', {
          conversation_id,
          user_id: user.sub,
          role: user.role,
          is_typing: !!is_typing
        });
      } catch (error) {
        logger.error('Error handling typing', { error: error.message, socketId: socket.id });
        socket.emit('support:error', { message: 'Failed to update typing status' });
      }
    });

    // support:message:send
    socket.on('support:message:send', async (data) => {
      try {
        const { conversation_id, body, subject } = data;

        if (!body || body.trim().length === 0) {
          return socket.emit('support:error', { message: 'Message body required' });
        }

        if (body.length > 5000) {
          return socket.emit('support:error', { message: 'Message too long (max 5000 characters)' });
        }

        let convId = conversation_id;

        if (!convId) {
          // Create new conversation for user
          if (user.role !== 'user') {
            return socket.emit('support:error', { message: 'conversation_id required for non-users' });
          }

          const [result] = await pool.execute(
            'INSERT INTO support_conversations (user_id, company_id, subject, status) VALUES (?, ?, ?, ?)',
            [user.sub, user.company_id || null, subject || null, 'open']
          );
          convId = result.insertId;
          logger.info('New conversation created', { conversationId: convId, userId: user.sub });
        } else {
          // Check access
          if (user.role === 'user') {
            const [conv] = await pool.execute('SELECT user_id FROM support_conversations WHERE id = ?', [convId]);
            if (conv.length === 0 || conv[0].user_id !== user.sub) {
              return socket.emit('support:error', { message: 'Access denied' });
            }
          }
        }

        // Insert message
        const senderType = user.role === 'user' ? 'user' : user.role;
        const [msgResult] = await pool.execute(
          'INSERT INTO support_messages (conversation_id, sender_type, sender_id, body) VALUES (?, ?, ?, ?)',
          [convId, senderType, user.sub, body.trim()]
        );

        // Update conversation last_message_at
        await pool.execute(
          'UPDATE support_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ?',
          [convId]
        );

        const message = {
          id: msgResult.insertId,
          conversation_id: convId,
          sender_type: senderType,
          sender_id: user.sub,
          body: body.trim(),
          is_internal: 0,
          created_at: new Date().toISOString()
        };

        // Broadcast to conversation room, excluding sender
        io.to(`conversation:${convId}`).except(socket.id).emit('support:message:new', message);
        logger.debug('Broadcasted message to conversation room', {
          room: `conversation:${convId}`,
          socketId: socket.id,
          messageId: message.id,
          excludedSender: true
        });

        // If sender is staff, also broadcast to staff room excluding sender
        if (user.role !== 'user') {
          io.to('support:staff').except(socket.id).emit('support:message:new', message);
          logger.debug('Broadcasted message to staff room', {
            room: 'support:staff',
            socketId: socket.id,
            messageId: message.id,
            excludedSender: true
          });
        }

        socket.emit('support:message:sent', { message_id: message.id });

        logger.info('Message sent', {
          messageId: message.id,
          conversationId: convId,
          userId: user.sub,
          role: user.role
        });
      } catch (error) {
        logger.error('Error sending message', { error: error.message, socketId: socket.id });
        socket.emit('support:error', { message: 'Failed to send message' });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info('Client disconnected', {
        socketId: socket.id,
        userId: user.sub,
        role: user.role,
        companyId: user.company_id,
        reason
      });
    });
  });
};