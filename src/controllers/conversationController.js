const ConversationService = require('../services/conversationService');

class ConversationController {
  constructor() {
    this.service = new ConversationService();
  }

  async getConversations(req, res) {
    try {
      const { sub: userId, role } = req.user;
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 25, 100);

      const result = await this.service.getConversations(userId, role, page, limit);
      res.json({ ok: true, data: result });
    } catch (error) {
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

      if (!['open', 'pending', 'resolved', 'closed'].includes(status)) {
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