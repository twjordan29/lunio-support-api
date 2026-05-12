const logger = require('../utils/logger');
const { verifyAuthToken, verifyGuestToken } = require('../services/tokenService');
const pool = require('../config/db');

module.exports = (io) => {
  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const guestToken = socket.handshake.auth?.guest_token;

    if (token) {
      try {
        const user = verifyAuthToken(token);
        socket.data.user = user;
        socket.data.authType = user.role === 'user' ? 'user' : 'staff';
        next();
      } catch (error) {
        logger.info('socket_auth_failed', { error: 'invalid auth token' });
        return next(new Error('Invalid authentication token'));
      }
    } else if (guestToken) {
      try {
        const guest = verifyGuestToken(guestToken);
        socket.data.guest = guest;
        socket.data.authType = 'guest';
        next();
      } catch (error) {
        logger.info('socket_auth_failed', { error: 'invalid guest token' });
        return next(new Error('Invalid guest token'));
      }
    } else {
      logger.info('socket_auth_failed', { error: 'no token provided' });
      return next(new Error('Authentication token required'));
    }
  });

  io.on('connection', (socket) => {
    logger.info('socket_connected', { auth_type: socket.data.authType });

    const authType = socket.data.authType;
    const { user, guest } = socket.data;

    if (authType === 'user' || authType === 'staff') {
      socket.emit('support:connected', {
        ok: true,
        auth_type: authType,
        conversation_id: null // No specific conversation on connect
      });

      // Join user room
      socket.join(`user:${user.sub}`);
      // Staff join staff room
      if (authType === 'staff') {
        socket.join('staff');
      }
    } else if (authType === 'guest') {
      socket.emit('support:connected', {
        ok: true,
        auth_type: 'guest',
        conversation_id: guest.conversation_id
      });

      // Join conversation room
      socket.join(`conversation:${guest.conversation_id}`);
    }

    // support:typing
    socket.on('support:typing', (data) => {
      try {
        const { conversation_id, is_typing } = data;
        if (!conversation_id) {
          return socket.emit('support:error', { code: 'VALIDATION_ERROR', message: 'conversation_id required' });
        }

        // Broadcast to conversation room excluding sender
        io.to(`conversation:${conversation_id}`).except(socket.id).emit('support:typing', {
          conversation_id,
          is_typing: !!is_typing
        });
      } catch (error) {
        logger.error('Error handling typing', { error: error.message, socketId: socket.id });
        socket.emit('support:error', { code: 'INTERNAL_ERROR', message: 'Failed to update typing status' });
      }
    });

    // support:message:send
    socket.on('support:message:send', async (data) => {
      try {
        logger.info('message_send_started', { conversation_id: data.conversation_id });

        const { conversation_id, body } = data;
        const authType = socket.data.authType;

        if (!conversation_id || !body || body.trim().length === 0) {
          return socket.emit('support:error', { code: 'VALIDATION_ERROR', message: 'conversation_id and body required' });
        }

        if (body.length > 5000) {
          return socket.emit('support:error', { code: 'VALIDATION_ERROR', message: 'Message too long' });
        }

        // Validate conversation access
        let senderType, senderId;
        const [conv] = await pool.execute('SELECT source, user_id, guest_session_id FROM support_conversations WHERE id = ?', [conversation_id]);
        if (conv.length === 0) {
          return socket.emit('support:error', { code: 'ACCESS_DENIED', message: 'Conversation not found' });
        }

        const conversation = conv[0];

        if (authType === 'guest') {
          if (conversation.source !== 'guest' || conversation.guest_session_id !== guest.session_id) {
            return socket.emit('support:error', { code: 'ACCESS_DENIED', message: 'Access denied' });
          }
          senderType = 'guest';
          senderId = null;
        } else if (authType === 'user') {
          if (conversation.source !== 'authenticated' || conversation.user_id !== user.sub) {
            return socket.emit('support:error', { code: 'ACCESS_DENIED', message: 'Access denied' });
          }
          senderType = 'user';
          senderId = user.sub;
        } else if (authType === 'staff') {
          // Staff can access any conversation
          senderType = 'staff';
          senderId = user.sub;
        }

        // Insert message
        const [msgResult] = await pool.execute(
          'INSERT INTO support_messages (conversation_id, sender_type, sender_id, body, created_at) VALUES (?, ?, ?, ?, NOW())',
          [conversation_id, senderType, senderId, body.trim()]
        );

        // Update conversation updated_at
        await pool.execute('UPDATE support_conversations SET updated_at = NOW() WHERE id = ?', [conversation_id]);

        const messageId = msgResult.insertId;

        // Emit to room
        const messagePayload = {
          conversation_id,
          message: {
            id: messageId,
            sender_type: senderType,
            body: body.trim(),
            created_at: new Date().toISOString()
          }
        };
        io.to(`conversation:${conversation_id}`).emit('support:message:new', messagePayload);
        if (senderType === 'guest' || senderType === 'user') {
          io.to('staff').emit('support:message:new', messagePayload);
        }

        // Emit to sender
        socket.emit('support:message:sent', { conversation_id, message_id: messageId });

        logger.info('message_send_success', { message_id: messageId });
      } catch (error) {
        logger.error('message_send_failed', { error: error.message });
        socket.emit('support:error', { code: 'INTERNAL_ERROR', message: 'Failed to send message' });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info('socket_disconnected', { auth_type: authType, reason });
    });
  });
};
