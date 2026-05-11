const crypto = require('crypto');
const ConversationService = require('../services/conversationService');
const { generateGuestToken } = require('../utils/guestToken');

class GuestController {
  constructor() {
    this.service = new ConversationService();
  }

  async createToken(req, res) {
    try {
      const { name, email } = req.body;

      // Validate
      if (!name || !email) {
        return res.status(400).json({ ok: false, error: { message: 'Name and email required', code: 'MISSING_FIELDS' } });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ ok: false, error: { message: 'Invalid email format', code: 'INVALID_EMAIL' } });
      }

      if (name.length > 255 || email.length > 255) {
        return res.status(400).json({ ok: false, error: { message: 'Name or email too long', code: 'FIELD_TOO_LONG' } });
      }

      // Generate session id
      const sessionId = crypto.randomUUID();

      const token = generateGuestToken(sessionId);

      res.json({
        ok: true,
        data: {
          token,
          session_id: sessionId,
          expires_in: 3600 * 24 * 7
        }
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
    }
  }

  async createConversation(req, res) {
    try {
      const { name, email, first_message, source_url } = req.body;
      const { session_id } = req.guest;

      // Create conversation with guest data
      const repository = require('../repositories/conversationRepository');
      const repo = new repository();

      const conversationId = await repo.createConversation(null, null, null); // No user_id, company_id

      // Update with guest data
      await repo.pool.execute(`
        UPDATE support_conversations
        SET conversation_type = 'guest',
            guest_name = ?,
            guest_email = ?,
            guest_session_id = ?,
            source_url = ?,
            status = 'open'
        WHERE id = ?
      `, [name, email, session_id, source_url || null, conversationId]);

      // If first message, send it
      if (first_message) {
        const messageId = await repo.createMessage(conversationId, 'user', null, first_message); // No sender_id for guest
        await repo.updateConversationLastMessage(conversationId);
      }

      // Generate token with conversation_id
      const token = generateGuestToken(session_id, conversationId);

      res.json({
        ok: true,
        data: {
          conversation: {
            id: conversationId,
            type: 'guest',
            status: 'open'
          },
          token
        }
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
    }
  }

  async getMessages(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const { session_id } = req.guest;

      // Check access: guest_session_id matches
      const repository = require('../repositories/conversationRepository');
      const repo = new repository();
      const conv = await repo.getConversationById(conversationId);
      if (!conv || conv.conversation_type !== 'guest' || conv.guest_session_id !== session_id) {
        return res.status(403).json({ ok: false, error: { message: 'Access denied', code: 'ACCESS_DENIED' } });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 25, 100);

      const result = await this.service.getMessages(conversationId, null, 'user', page, limit); // Role 'user' to exclude internal

      res.json({ ok: true, data: result });
    } catch (error) {
      res.status(500).json({ ok: false, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
    }
  }

  async sendMessage(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const { body } = req.body;
      const { session_id } = req.guest;

      // Check access
      const repository = require('../repositories/conversationRepository');
      const repo = new repository();
      const conv = await repo.getConversationById(conversationId);
      if (!conv || conv.conversation_type !== 'guest' || conv.guest_session_id !== session_id) {
        return res.status(403).json({ ok: false, error: { message: 'Access denied', code: 'ACCESS_DENIED' } });
      }

      if (!body || body.trim().length === 0) {
        return res.status(400).json({ ok: false, error: { message: 'Message body required', code: 'MISSING_BODY' } });
      }

      if (body.length > 5000) {
        return res.status(400).json({ ok: false, error: { message: 'Message too long', code: 'MESSAGE_TOO_LONG' } });
      }

      const messageId = await repo.createMessage(conversationId, 'user', null, body.trim());
      await repo.updateConversationLastMessage(conversationId);

      res.json({
        ok: true,
        data: {
          message_id: messageId,
          conversation_id: conversationId
        }
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
    }
  }
}

module.exports = GuestController;