const pool = require('../config/db');
const logger = require('../utils/logger');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CUSTOMER_SENDER_TYPES = new Set(['guest', 'user']);

class PushNotificationService {
  async notifyForMessage(conversation, message) {
    logger.debug('support_push_notify_called', {
      conversation_id: conversation?.id,
      message_id: message?.id,
      sender_type: message?.sender_type,
      conversation_status: conversation?.status
    });

    if (!conversation || !message || !CUSTOMER_SENDER_TYPES.has(String(message.sender_type || '').toLowerCase())) {
      logger.debug('support_push_skipped_invalid_input');
      return;
    }
    if (conversation.status !== 'open') {
      logger.info('support_push_skipped_inactive_conversation', { conversation_id: conversation.id, status: conversation.status });
      return;
    }

    const staffIds = await this.resolveStaffRecipients(conversation);
    logger.info('support_push_recipients_selected', {
      conversation_id: conversation.id,
      message_id: message.id,
      assigned_admin_id: conversation.assigned_admin_id || null,
      assigned: !!conversation.assigned_admin_id,
      staff_user_ids: staffIds,
    });

    if (staffIds.length === 0) return;

    const tokens = await this.getActiveExpoTokens(staffIds);
    logger.info('support_push_tokens_found', { conversation_id: conversation.id, message_id: message.id, token_count: tokens.length });
    if (tokens.length === 0) return;

    const snippet = this.snippet(message.body);
    const tickets = await this.sendExpoMessages(tokens.map((token) => ({
      to: token,
      sound: 'default',
      priority: 'high',
      channelId: 'support-messages',
      title: 'New support message',
      body: snippet || 'A customer sent a new support message.',
      data: {
        type: 'support_message',
        conversation_id: Number(conversation.id),
        message_id: Number(message.id),
      },
    })));

    logger.info('support_push_send_result', {
      conversation_id: conversation.id,
      message_id: message.id,
      ticket_count: tickets.length,
      ticket_statuses: tickets.map((ticket) => ticket.status || 'unknown'),
    });
  }

  async resolveStaffRecipients(conversation) {
    const assignedAdminId = Number(conversation.assigned_admin_id || 0);
    if (assignedAdminId > 0) return [assignedAdminId];

    const [rows] = await pool.execute(`
      SELECT DISTINCT mst.user_id
      FROM mobile_support_device_tokens mst
      WHERE mst.revoked_at IS NULL
    `);
    return rows.map((row) => Number(row.user_id)).filter((id) => id > 0);
  }

  async getActiveExpoTokens(userIds) {
    const uniqueIds = [...new Set(userIds.map((id) => Number(id)).filter((id) => id > 0))];
    if (uniqueIds.length === 0) return [];

    const placeholders = uniqueIds.map(() => '?').join(',');
    const [rows] = await pool.execute(`
      SELECT DISTINCT expo_push_token
      FROM mobile_support_device_tokens
      WHERE revoked_at IS NULL
        AND expo_push_token IS NOT NULL
        AND expo_push_token <> ''
        AND user_id IN (${placeholders})
    `, uniqueIds);

    return rows.map((row) => String(row.expo_push_token || '').trim()).filter(Boolean);
  }

  async sendExpoMessages(messages) {
    logger.info('support_push_expo_request_created', { message_count: messages.length, chunk_count: Math.ceil(messages.length / 100) });
    const tickets = [];
    for (const chunk of this.chunk(messages, 100)) {
      try {
        logger.debug('support_push_expo_sending_chunk', { chunk_size: chunk.length });
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chunk),
        });
        const data = await response.json().catch(() => ({}));
        const chunkTickets = Array.isArray(data.data) ? data.data : [];
        tickets.push(...chunkTickets);
        logger.info('support_push_expo_chunk_result', {
          chunk_size: chunk.length,
          response_status: response.status,
          ticket_count: chunkTickets.length,
          has_errors: !!data.errors
        });
        if (!response.ok) {
          logger.warn('support_push_expo_http_failed', { status: response.status, errors: data.errors || null });
        }
        if (data.errors && data.errors.length > 0) {
          logger.warn('support_push_expo_api_errors', { errors: data.errors });
        }
      } catch (error) {
        logger.error('support_push_expo_send_failed', { err_message: error.message });
      }
    }
    logger.info('support_push_expo_complete', { total_tickets: tickets.length });
    return tickets;
  }

  chunk(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
  }

  snippet(body) {
    return String(body || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  }
}

module.exports = PushNotificationService;
