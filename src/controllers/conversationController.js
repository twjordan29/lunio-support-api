const ConversationService = require('../services/conversationService');
const PushNotificationService = require('../services/pushNotificationService');
const logger = require('../utils/logger');

const CUSTOMER_SENDER_TYPES = new Set(['guest', 'user']);

class ConversationController {
  constructor() {
    this.service = new ConversationService();
    this.pushNotifications = new PushNotificationService();
  }

  emitStaff(io, event, payload) {
    if (io) io.to('staff').emit(event, payload);
  }

  emitConversation(io, conversationId, event, payload) {
    if (io) io.to(`conversation:${conversationId}`).emit(event, payload);
  }

  safeError(res, error) {
    if (error.message === 'Access denied') {
      return res.status(403).json({ ok: false, error: { message: 'Access denied', code: 'ACCESS_DENIED' } });
    }
    if (error.message === 'Invalid status') {
      return res.status(400).json({ ok: false, error: { message: 'Invalid status', code: 'INVALID_STATUS' } });
    }
    return res.status(500).json({ ok: false, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  }

  async getConversations(req, res) {
    try {
      const { sub: userId, role } = req.user;
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
      const filters = {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        mine: String(req.query.mine || '0') === '1',
        unassigned: String(req.query.unassigned || '0') === '1',
      };

      const result = await this.service.getConversations(userId, role, filters, page, limit);
      return res.json({ ok: true, data: result });
    } catch (error) {
      logger.error('conversations_endpoint_failed', { user_id: req.user?.sub, role: req.user?.role, err_name: error.name, err_message: error.message, err_code: error.code });
      return this.safeError(res, error);
    }
  }

  async getMessages(req, res) {
    try {
      const conversationId = parseInt(req.params.id || req.params.conversationId, 10);
      const { sub: userId, role } = req.user;
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
      const result = await this.service.getMessages(conversationId, userId, role, page, limit);
      return res.json({ ok: true, data: result });
    } catch (error) {
      return this.safeError(res, error);
    }
  }

  async getUnreadCount(req, res) {
    try {
      const { sub: userId, role } = req.user;
      const result = await this.service.getUnreadCount(userId, role);
      return res.json({ ok: true, data: result });
    } catch (error) {
      return this.safeError(res, error);
    }
  }

  async markRead(req, res) {
    try {
      const conversationId = parseInt(req.params.id || req.params.conversationId, 10);
      const { sub: userId, role } = req.user;
      const result = await this.service.markRead(conversationId, userId, role);
      this.emitConversation(req.app.get('io'), conversationId, 'support:conversation:read', {
        conversation_id: conversationId,
        reader_id: userId,
        reader_role: role,
        last_read_message_id: result.last_read_message_id,
        last_read_at: result.last_read_at,
        unread_count: result.unread_count,
      });
      return res.json({ ok: true, data: result });
    } catch (error) {
      return this.safeError(res, error);
    }
  }

  async claim(req, res) {
    try {
      const conversationId = parseInt(req.params.id || req.params.conversationId, 10);
      const { sub: userId, role } = req.user;
      const conversation = await this.service.claimConversation(conversationId, userId, role);
      const summary = await this.service.getConversationSummary(conversationId, userId, role);
      const payload = { conversation_id: conversationId, conversation: summary || conversation };
      const io = req.app.get('io');
      this.emitStaff(io, 'support:conversation:claimed', payload);
      this.emitStaff(io, 'support:conversation:updated', payload);
      return res.json({ ok: true, data: payload });
    } catch (error) {
      return this.safeError(res, error);
    }
  }

  async release(req, res) {
    try {
      const conversationId = parseInt(req.params.id || req.params.conversationId, 10);
      const { sub: userId, role } = req.user;
      const conversation = await this.service.releaseConversation(conversationId, userId, role);
      const summary = await this.service.getConversationSummary(conversationId, userId, role);
      const payload = { conversation_id: conversationId, conversation: summary || conversation };
      const io = req.app.get('io');
      this.emitStaff(io, 'support:conversation:updated', payload);
      return res.json({ ok: true, data: payload });
    } catch (error) {
      return this.safeError(res, error);
    }
  }

  async assign(req, res) {
    try {
      const conversationId = parseInt(req.params.id || req.params.conversationId, 10);
      const adminId = Number(req.body?.admin_id || 0) || null;
      const { sub: userId, role } = req.user;
      const conversation = await this.service.assignConversation(conversationId, adminId, userId, role);
      const summary = await this.service.getConversationSummary(conversationId, userId, role);
      const payload = { conversation_id: conversationId, conversation: summary || conversation };
      const io = req.app.get('io');
      this.emitStaff(io, 'support:conversation:claimed', payload);
      this.emitStaff(io, 'support:conversation:updated', payload);
      return res.json({ ok: true, data: payload });
    } catch (error) {
      return this.safeError(res, error);
    }
  }

  async updateStatus(req, res) {
    try {
      const conversationId = parseInt(req.params.id || req.params.conversationId, 10);
      const { status } = req.body;
      const { sub: userId, role } = req.user;
      const conversation = await this.service.updateStatus(conversationId, status, userId, role);
      const summary = await this.service.getConversationSummary(conversationId, userId, role);
      const payload = { conversation_id: conversationId, status, conversation: summary || conversation };
      const io = req.app.get('io');
      this.emitStaff(io, 'support:conversation:status_changed', payload);
      this.emitStaff(io, 'support:conversation:updated', payload);
      this.emitConversation(io, conversationId, 'support:conversation:status_changed', payload);
      return res.json({ ok: true, data: payload });
    } catch (error) {
      return this.safeError(res, error);
    }
  }

  async sendMessage(req, res) {
    try {
      const conversationId = parseInt(req.params.id || req.params.conversationId, 10);
      const body = String(req.body?.body || '').trim();
      const { sub: userId, role } = req.user;

      if (body === '') {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Message body required' } });
      }
      if (body.length > 5000) {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Message too long' } });
      }

      const message = await this.service.sendMessage(conversationId, userId, role, body);
      const summary = await this.service.getConversationSummary(conversationId, userId, role);
      const messagePayload = { conversation_id: conversationId, message };
      const updatePayload = { conversation_id: conversationId, conversation: summary };
      const io = req.app.get('io');
      this.emitConversation(io, conversationId, 'support:message:new', messagePayload);
      this.emitStaff(io, 'support:conversation:updated', updatePayload);
      if (io) io.to(`user:${userId}`).emit('support:message:sent', { conversation_id: conversationId, message_id: message.id, message });
      if (message.sender_type === 'user') this.emitStaff(io, 'support:message:new', messagePayload);

      const shouldDispatchPush = CUSTOMER_SENDER_TYPES.has(message.sender_type);
      logger.info('support_message_created', {
        message_id: message.id,
        conversation_id: conversationId,
        sender_type: message.sender_type,
        sender_user_id: message.sender_id,
        conversation_assigned_staff_id: summary?.assigned_admin_id || null,
        conversation_status: summary?.status || null,
        should_dispatch_push: shouldDispatchPush
      });

      if (shouldDispatchPush) {
        await this.pushNotifications.notifyForMessage(summary, message);
      }

      return res.json({ ok: true, data: { message } });
    } catch (error) {
      return this.safeError(res, error);
    }
  }
}

module.exports = ConversationController;
