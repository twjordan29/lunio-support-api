const crypto = require('crypto');
const ConversationService = require('../services/conversationService');
const PushNotificationService = require('../services/pushNotificationService');
const { generateGuestToken } = require('../services/tokenService');
const logger = require('../utils/logger');
const pool = require('../config/db');

class GuestController {
  constructor() {
    this.service = new ConversationService();
    this.pushNotifications = new PushNotificationService();
  }

  async startConversation(req, res) {
    try {
      const { name, email, message: body, page_url: pageUrl } = req.body;

      // Validate
      if (!name || !email || !body) {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Name, email, and message are required' } });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid email format' } });
      }

      if (name.length > 255 || email.length > 255 || body.length > 5000) {
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

      logger.info('guest_session_created');

      // Create support conversation
      const [convResult] = await pool.execute(`
        INSERT INTO support_conversations (source, status, guest_session_id, visitor_name, visitor_email, page_url, created_at, updated_at)
        VALUES ('guest', 'open', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [sessionId, name.trim(), email.trim(), typeof pageUrl === 'string' ? pageUrl.slice(0, 2000) : null]);
      const conversationId = convResult.insertId;

      logger.info('guest_conversation_created', { conversation_id: conversationId });

      // Create first support message
      const [msgResult] = await pool.execute(`
        INSERT INTO support_messages (conversation_id, sender_type, body, created_at)
        VALUES (?, 'guest', ?, CURRENT_TIMESTAMP)
      `, [conversationId, body.trim()]);
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

      const messagePayload = {
        id: messageId,
        conversation_id: conversationId,
        sender_type: 'guest',
        sender_id: null,
        body: body.trim(),
        created_at: new Date().toISOString(),
        read_at: null,
      };
      const conversation = {
        id: conversationId,
        source: 'guest',
        status: 'open',
        assigned_admin_id: null,
        assigned_admin_name: null,
        customer_name: name || 'Guest',
        customer_email: email || null,
        latest_message: messagePayload.body,
        latest_message_sender_type: 'guest',
        latest_message_at: messagePayload.created_at,
        unread_count: 1,
        message_count: 1,
        created_at: messagePayload.created_at,
        updated_at: messagePayload.created_at,
      };
      logger.info('support_message_created', {
        message_id: messageId,
        conversation_id: conversationId,
        sender_type: 'guest',
        sender_user_id: null,
        conversation_assigned_staff_id: null,
        conversation_status: 'open',
        should_dispatch_push: true
      });
      await this.pushNotifications.notifyForMessage(conversation, messagePayload);

      const io = req.app.get('io');
      if (io) {
        io.to('staff').emit('support:message:new', { conversation_id: conversationId, message: messagePayload });
        io.to('staff').emit('support:conversation:updated', { conversation_id: conversationId, conversation });
      }
      logger.info('support_message_created', { conversation_id: conversationId, message_id: messageId, sender_type: 'guest', assigned_admin_id: null, status: 'open' });

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

  async sendMessage(req, res) {
    try {
      const conversationId = Number(req.params.id);
      const tokenConversationId = Number(req.guest?.conversation_id || 0);
      const body = String(req.body?.body || '').trim();
      if (!conversationId || conversationId !== tokenConversationId) {
        return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Access denied' } });
      }
      if (!body) {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Message body required' } });
      }
      if (body.length > 5000) {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Message too long' } });
      }

      const [msgResult] = await pool.execute(
        `INSERT INTO support_messages (conversation_id, sender_type, body, created_at) VALUES (?, 'guest', ?, CURRENT_TIMESTAMP)`,
        [conversationId, body]
      );
      await pool.execute(`UPDATE support_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ?`, [conversationId]);
      const [rows] = await pool.execute(
        'SELECT id, conversation_id, sender_type, sender_id, body, created_at, read_at FROM support_messages WHERE id = ?',
        [msgResult.insertId]
      );
      const message = rows[0] || null;

      const io = req.app.get('io');
      if (io && message) {
        io.to('staff').emit('support:message:new', { conversation_id: conversationId, message });
        io.to(`conversation:${conversationId}`).emit('support:message:new', { conversation_id: conversationId, message });
      }

      return res.json({ ok: true, data: { message } });
    } catch (error) {
      logger.error('guest_send_message_failed', { code: error.code, name: error.name, message: error.message });
      return res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }

  async endConversation(req, res) {
    try {
      const conversationId = Number(req.params.id);
      const tokenConversationId = Number(req.guest?.conversation_id || 0);
      if (isNaN(conversationId)) {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid conversation ID' } });
      }
      if (!tokenConversationId || tokenConversationId !== conversationId) {
        return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Access denied' } });
      }

      // Verify the guest has access to this conversation
      const [rows] = await pool.execute(
        'SELECT id FROM support_conversations WHERE id = ? AND source = "guest"',
        [conversationId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
      }

      // Update status to closed
      await pool.execute(
        'UPDATE support_conversations SET status = "closed", closed_at = NOW(), updated_at = NOW() WHERE id = ?',
        [conversationId]
      );

      // Emit realtime update
      const summary = {
        id: conversationId,
        status: 'closed',
        updated_at: new Date().toISOString(),
      };

      const io = req.app.get('io');
      if (io) {
        io.emit('support:conversation:status_changed', {
          conversation_id: conversationId,
          status: 'closed',
          conversation: summary,
        });

        io.to(`conversation:${conversationId}`).emit('support:conversation:status_changed', {
          conversation_id: conversationId,
          status: 'closed',
          conversation: summary,
        });
      }

      return res.json({ ok: true });
    } catch (error) {
      logger.error('guest_end_conversation_failed', { code: error.code, name: error.name, message: error.message });
      return res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }


}

module.exports = GuestController;
