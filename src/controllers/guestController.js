const crypto = require('crypto');
const ConversationService = require('../services/conversationService');
const { generateGuestToken } = require('../services/tokenService');
const logger = require('../utils/logger');
const pool = require('../config/db');

class GuestController {
  constructor() {
    this.service = new ConversationService();
  }

  async startConversation(req, res) {
    try {
      const { name, email, message } = req.body;

      // Validate
      if (!name || !email || !message) {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Name, email, and message are required' } });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid email format' } });
      }

      if (name.length > 255 || email.length > 255 || message.length > 5000) {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Fields exceed maximum length' } });
      }

      logger.info('guest_conversation_start_started');

      // Generate session UUID
      const sessionUuid = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Create or update guest session
      await pool.execute(`
        INSERT INTO support_guest_sessions (session_uuid, name, email, expires_at)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email), updated_at = CURRENT_TIMESTAMP
      `, [sessionUuid, name, email, expiresAt]);

      const [sessionResult] = await pool.execute('SELECT id FROM support_guest_sessions WHERE session_uuid = ?', [sessionUuid]);
      const sessionId = sessionResult[0].id;

      logger.info('guest_session_created', { session_uuid: sessionUuid });

      // Create support conversation
      const [convResult] = await pool.execute(`
        INSERT INTO support_conversations (source, status, guest_session_id, created_at, updated_at)
        VALUES ('guest', 'open', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [sessionId]);
      const conversationId = convResult.insertId;

      logger.info('guest_conversation_created', { conversation_id: conversationId });

      // Create first support message
      const [msgResult] = await pool.execute(`
        INSERT INTO support_messages (conversation_id, sender_type, body, created_at)
        VALUES (?, 'guest', ?, CURRENT_TIMESTAMP)
      `, [conversationId, message.trim()]);
      const messageId = msgResult.insertId;

      logger.info('guest_first_message_created', { message_id: messageId });

      // Create participant row for guest
      await pool.execute(`
        INSERT INTO support_conversation_participants (conversation_id, participant_type, created_at)
        VALUES (?, 'guest', CURRENT_TIMESTAMP)
      `, [conversationId]);

      // Issue guest JWT
      const guestToken = generateGuestToken(sessionId, conversationId);

      logger.info('guest_token_issued', { conversation_id: conversationId });

      res.json({
        ok: true,
        data: {
          conversation_id: conversationId,
          guest_token: guestToken,
          session_id: sessionUuid,
          message_id: messageId
        }
      });
    } catch (error) {
      logger.error('guest_conversation_start_failed', {
        error: error.message,
        name: error.name,
        code: error.code
      });
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }

  async getMessages(req, res) {
    try {
      const conversationId = parseInt(req.params.id, 10);
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
      const tokenConversationId = Number(req.guest?.conversation_id || 0);

      if (!conversationId || tokenConversationId !== conversationId) {
        return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Access denied' } });
      }

      const offset = (page - 1) * limit;
      const [messages] = await pool.execute(
        'SELECT id, conversation_id, sender_type, sender_id, body, created_at FROM support_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [conversationId, limit, offset]
      );
      const [totalRows] = await pool.execute('SELECT COUNT(*) AS count FROM support_messages WHERE conversation_id = ?', [conversationId]);
      const total = Number(totalRows?.[0]?.count || 0);

      return res.json({
        ok: true,
        data: {
          messages: messages.reverse(),
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      logger.error('guest_messages_fetch_failed', { code: error.code, name: error.name, message: error.message });
      return res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }


}

module.exports = GuestController;
