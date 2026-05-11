const ConversationService = require('../services/conversationService');
const logger = require('../utils/logger');

class ConversationController {
  constructor() {
    this.service = new ConversationService();
  }

  async getConversations(req, res) {
    try {
      const { sub: userId, role, company_id: companyId } = req.user;
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 25, 100);

      logger.info('auth_user_loaded', { user_id: userId, role, company_id: companyId, route: req.path });

      const result = await this.service.getConversations(userId, role, page, limit);
      res.json({ ok: true, data: result });
    } catch (error) {
      logger.error('conversations_endpoint_failed', {
        user_id: req.user?.sub,
        role: req.user?.role,
        company_id: req.user?.company_id,
        route: req.path,
        err_name: error.name,
        err_message: error.message,
        err_code: error.code,
        err_errno: error.errno,
        err_sqlState: error.sqlState,
        err_sqlMessage: error.sqlMessage
      });
      res.status(500).json({ ok: false, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
    }
  }

  async getMessages(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const { sub: userId, role } = req.user;
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 25, 100);

      const result = await this.service.getMessages(conversationId, userId, role, page, limit);
      res.json({ ok: true, data: result });
    } catch (error) {
      if (error.message === 'Access denied') {
        return res.status(403).json({ ok: false, error: { message: 'Access denied', code: 'ACCESS_DENIED' } });
      }
      res.status(500).json({ ok: false, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
    }
  }

  async markRead(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const { sub: userId, role } = req.user;

      const result = await this.service.markRead(conversationId, userId, role);

      // Emit read receipt
      const io = req.app.get('io');
      io.to(`conversation:${conversationId}`).emit('support:conversation:read', {
        conversation_id: conversationId,
        reader_id: userId,
        reader_role: role,
        last_read_message_id: result.last_read_message_id,
        last_read_at: result.last_read_at
      });

      res.json({ ok: true, data: result });
    } catch (error) {
      if (error.message === 'Access denied') {
        return res.status(403).json({ ok: false, error: { message: 'Access denied', code: 'ACCESS_DENIED' } });
      }
      res.status(500).json({ ok: false, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
    }
  }

  async updateStatus(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const { status } = req.body;
      const { sub: userId, role } = req.user;

      if (!['open', 'closed'].includes(status)) {
        return res.status(400).json({ ok: false, error: { message: 'Invalid status', code: 'INVALID_STATUS' } });
      }

      const updated = await this.service.updateStatus(conversationId, status, userId, role);
      res.json({ ok: true, data: { conversation: updated } });
    } catch (error) {
      if (error.message === 'Access denied') {
        return res.status(403).json({ ok: false, error: { message: 'Access denied', code: 'ACCESS_DENIED' } });
      }
      res.status(500).json({ ok: false, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
    }
  }

  async sendMessage(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const { body } = req.body;
      const { sub: userId, role } = req.user;

      if (!body || body.trim().length === 0) {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Message body required' } });
      }

      if (body.length > 5000) {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Message too long' } });
      }

      const messageId = await this.service.sendMessage(conversationId, userId, role, body.trim());

      // Emit to room
      const io = req.app.get('io');
      io.to(`conversation:${conversationId}`).emit('support:message:new', {
        conversation_id: conversationId,
        message: {
          id: messageId,
          sender_type: role === 'user' ? 'user' : 'staff',
          body: body.trim(),
          created_at: new Date().toISOString()
        }
      });

      // Emit sent to sender
      io.to(`user:${userId}`).emit('support:message:sent', {
        conversation_id: conversationId,
        message_id: messageId
      });

      res.json({ ok: true, data: { message_id: messageId } });
    } catch (error) {
      if (error.message === 'Access denied') {
        return res.status(403).json({ ok: false, error: { message: 'Access denied', code: 'ACCESS_DENIED' } });
      }
      res.status(500).json({ ok: false, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
    }
  }

  async updateAssignment(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const { assigned_admin_id } = req.body;
      const { sub: userId, role } = req.user;

      const updated = await this.service.updateAssignment(conversationId, assigned_admin_id, userId, role);
      res.json({ ok: true, data: { conversation: updated } });
    } catch (error) {
      if (error.message === 'Access denied') {
        return res.status(403).json({ ok: false, error: { message: 'Access denied', code: 'ACCESS_DENIED' } });
      }
      res.status(500).json({ ok: false, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
    }
  }
}

module.exports = ConversationController;