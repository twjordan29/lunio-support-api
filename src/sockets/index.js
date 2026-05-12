const logger = require('../utils/logger');
const { verifyAuthToken, verifyGuestToken } = require('../services/tokenService');
const ConversationRepository = require('../repositories/conversationRepository');

const STAFF_ROLES = new Set(['admin', 'support', 'staff']);

module.exports = (io) => {
  const repository = new ConversationRepository();

  const emitConversationUpdated = async (conversationId, userId, role) => {
    const conversation = await repository.getConversationSummary(conversationId, userId, role);
    const payload = { conversation_id: conversationId, conversation };
    io.to('staff').emit('support:conversation:updated', payload);
    return payload;
  };

  io.use((socket, next) => {
    console.debug('[socket-auth] auth started, auth keys:', Object.keys(socket.handshake.auth || {}));
    const token = socket.handshake.auth?.token;
    const guestToken = socket.handshake.auth?.guest_token;

    if (token) {
      try {
        console.debug('[socket-auth] verifying auth token');
        const user = verifyAuthToken(token);
        socket.data.user = user;
        socket.data.authType = STAFF_ROLES.has(String(user.role || '').toLowerCase()) ? 'staff' : 'user';
        console.debug('[socket-auth] auth success, user:', user.id, 'role:', user.role, 'authType:', socket.data.authType);
        return next();
      } catch (error) {
        console.debug('[socket-auth] auth failed:', error.message);
        logger.info('socket_auth_failed', { error: 'invalid auth token', details: error.message });
        return next(new Error('Invalid authentication token'));
      }
    }

    if (guestToken) {
      try {
        console.debug('[socket-auth] verifying guest token');
        const guest = verifyGuestToken(guestToken);
        socket.data.guest = guest;
        socket.data.authType = 'guest';
        console.debug('[socket-auth] guest auth success, conversation:', guest.conversation_id);
        return next();
      } catch (error) {
        console.debug('[socket-auth] guest auth failed:', error.message);
        logger.info('socket_auth_failed', { error: 'invalid guest token', details: error.message });
        return next(new Error('Invalid guest token'));
      }
    }

    console.debug('[socket-auth] no token provided');
    logger.info('socket_auth_failed', { error: 'no token provided' });
    return next(new Error('Authentication token required'));
  });

  io.on('connection', (socket) => {
    const authType = socket.data.authType;
    const { user, guest } = socket.data;
    logger.info('socket_connected', { auth_type: authType });

    if (authType === 'user' || authType === 'staff') {
      socket.join(`user:${user.sub}`);
      if (authType === 'staff') socket.join('staff');
      socket.emit('support:connected', { ok: true, auth_type: authType, conversation_id: null });
    } else if (authType === 'guest') {
      console.debug('[socket] guest connected, conversation:', guest.conversation_id);
      socket.join(`conversation:${guest.conversation_id}`);
      socket.emit('support:connected', { ok: true, auth_type: 'guest', conversation_id: guest.conversation_id });
    }

    socket.on('disconnect', async (reason) => {
      console.debug('[socket] disconnect, authType:', authType, 'reason:', reason);
      if (authType === 'guest' && guest?.conversation_id) {
        try {
          console.debug('[socket] auto-closing guest conversation:', guest.conversation_id);
          // Check if conversation is still open
          const conversation = await repository.getConversationById(guest.conversation_id);
          if (conversation && conversation.status === 'open') {
            await repository.updateConversationStatus(guest.conversation_id, 'closed', null, 'guest');
            const summary = { id: guest.conversation_id, status: 'closed', updated_at: new Date().toISOString() };
            io.to('staff').emit('support:conversation:status_changed', { conversation_id: guest.conversation_id, status: 'closed', conversation: summary });
            io.to('staff').emit('support:conversation:updated', { conversation_id: guest.conversation_id, conversation: summary });
            io.to(`conversation:${guest.conversation_id}`).emit('support:conversation:status_changed', { conversation_id: guest.conversation_id, status: 'closed', conversation: summary });
            console.debug('[socket] auto-closed guest conversation successfully');
          } else {
            console.debug('[socket] guest conversation already closed or not open');
          }
        } catch (error) {
          console.error('[socket] failed to auto-close guest conversation:', error);
        }
      }
    });

    socket.on('support:conversation:join', async (data) => {
      try {
        const conversationId = Number(data?.conversation_id || 0);
        if (!conversationId) {
          return socket.emit('support:error', { code: 'VALIDATION_ERROR', message: 'conversation_id required' });
        }

        const conversation = await repository.getConversationById(conversationId);
        if (!conversation) {
          return socket.emit('support:error', { code: 'ACCESS_DENIED', message: 'Conversation not found', conversation_id: conversationId });
        }

        if (authType === 'guest' && (conversation.source !== 'guest' || Number(conversation.guest_session_id) !== Number(guest.session_id))) {
          return socket.emit('support:error', { code: 'ACCESS_DENIED', message: 'Access denied', conversation_id: conversationId });
        }
        if (authType === 'user' && (conversation.source !== 'authenticated' || Number(conversation.user_id) !== Number(user.sub))) {
          return socket.emit('support:error', { code: 'ACCESS_DENIED', message: 'Access denied', conversation_id: conversationId });
        }

        if (authType === 'staff' && conversation.status === 'open' && !conversation.assigned_admin_id) {
          await repository.claimConversation(conversationId, user.sub, user.role);
          const summary = await repository.getConversationSummary(conversationId, user.sub, user.role);
          const payload = { conversation_id: conversationId, conversation: summary };
          io.to('staff').emit('support:conversation:claimed', payload);
          io.to('staff').emit('support:conversation:updated', payload);
        }

        socket.join(`conversation:${conversationId}`);
        socket.emit('support:conversation:joined', { conversation_id: conversationId });
      } catch (error) {
        logger.error('conversation_join_failed', { err_message: error.message });
        socket.emit('support:error', { code: 'INTERNAL_ERROR', message: 'Failed to join conversation' });
      }
    });

    socket.on('support:typing', (data) => {
      try {
        const conversationId = Number(data?.conversation_id || 0);
        if (!conversationId) {
          return socket.emit('support:error', { code: 'VALIDATION_ERROR', message: 'conversation_id required' });
        }
        io.to(`conversation:${conversationId}`).except(socket.id).emit('support:typing', {
          conversation_id: conversationId,
          is_typing: !!data?.is_typing,
          sender_type: authType === 'staff' ? 'staff' : authType,
        });
      } catch (error) {
        logger.error('typing_failed', { err_message: error.message });
        socket.emit('support:error', { code: 'INTERNAL_ERROR', message: 'Failed to update typing status' });
      }
    });

    socket.on('support:message:send', async (data) => {
      try {
        const conversationId = Number(data?.conversation_id || 0);
        const body = String(data?.body || '').trim();
        if (!conversationId || body === '') {
          return socket.emit('support:error', { code: 'VALIDATION_ERROR', message: 'conversation_id and body required' });
        }
        if (body.length > 5000) {
          return socket.emit('support:error', { code: 'VALIDATION_ERROR', message: 'Message too long' });
        }

        const conversation = await repository.getConversationById(conversationId);
        if (!conversation) {
          return socket.emit('support:error', { code: 'ACCESS_DENIED', message: 'Conversation not found', conversation_id: conversationId });
        }

        let senderType = 'user';
        let senderId = null;

        if (authType === 'guest') {
          if (conversation.source !== 'guest' || Number(conversation.guest_session_id) !== Number(guest.session_id)) {
            return socket.emit('support:error', { code: 'ACCESS_DENIED', message: 'Access denied', conversation_id: conversationId });
          }
          senderType = 'guest';
        } else if (authType === 'user') {
          if (conversation.source !== 'authenticated' || Number(conversation.user_id) !== Number(user.sub)) {
            return socket.emit('support:error', { code: 'ACCESS_DENIED', message: 'Access denied', conversation_id: conversationId });
          }
          senderType = 'user';
          senderId = user.sub;
        } else if (authType === 'staff') {
          if (!repository.canStaffModify(conversation, user.sub, user.role)) {
            return socket.emit('support:error', { code: 'ACCESS_DENIED', message: 'Conversation is not assigned to this staff member', conversation_id: conversationId });
          }
          senderType = 'staff';
          senderId = user.sub;
        }

        const message = await repository.createMessage(conversationId, senderType, senderId, body);
        const messagePayload = { conversation_id: conversationId, message };
        io.to(`conversation:${conversationId}`).emit('support:message:new', messagePayload);
        socket.emit('support:message:sent', { conversation_id: conversationId, message_id: message.id, message });
        await emitConversationUpdated(conversationId, user?.sub || 0, user?.role || 'admin');
        if (senderType === 'guest' || senderType === 'user') {
          io.to('staff').emit('support:message:new', messagePayload);
        }

        logger.info('message_send_success', { conversation_id: conversationId, message_id: message.id, sender_type: senderType });
      } catch (error) {
        logger.error('message_send_failed', { err_message: error.message });
        socket.emit('support:error', { code: 'INTERNAL_ERROR', message: 'Failed to send message' });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info('socket_disconnected', { auth_type: authType, reason });
    });
  });
};
