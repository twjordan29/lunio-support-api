const pool = require('../config/db');
const logger = require('../utils/logger');

const STAFF_ROLES = new Set(['admin', 'support', 'staff']);
const VALID_STATUSES = new Set(['open', 'completed', 'closed']);
const CUSTOMER_SENDER_TYPES = new Set(['guest', 'user']);

class ConversationRepository {
  isStaffRole(role) {
    return STAFF_ROLES.has(String(role || '').toLowerCase());
  }

  isAdminRole(role) {
    return String(role || '').toLowerCase() === 'admin';
  }

  async getConversations(userId, role, filters = {}, page = 1, limit = 25) {
    const offset = (page - 1) * limit;
    const where = [];
    const params = [];

    if (this.isStaffRole(role)) {
      if (filters.status && VALID_STATUSES.has(filters.status)) {
        where.push('sc.status = ?');
        params.push(filters.status);
      }
      if (filters.mine) {
        where.push('sc.assigned_admin_id = ?');
        params.push(userId);
      }
      if (filters.unassigned) {
        where.push('sc.assigned_admin_id IS NULL');
      }
    } else {
      where.push('sc.user_id = ?');
      params.push(userId);
      if (filters.status && VALID_STATUSES.has(filters.status)) {
        where.push('sc.status = ?');
        params.push(filters.status);
      }
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const participantType = this.isStaffRole(role) ? 'staff' : 'user';
    const query = `
      SELECT
        sc.id,
        sc.source,
        sc.status,
        sc.assigned_admin_id,
        NULL AS assigned_admin_name,
        CASE
          WHEN sc.source = 'guest' THEN COALESCE(NULLIF(sgs.name, ''), 'Guest')
          ELSE COALESCE(NULLIF(sc.subject, ''), 'Customer')
        END AS customer_name,
        CASE WHEN sc.source = 'guest' THEN sgs.email ELSE NULL END AS customer_email,
        lm.body AS latest_message,
        lm.sender_type AS latest_message_sender_type,
        lm.created_at AS latest_message_at,
        COALESCE(unread.unread_count, 0) AS unread_count,
        COALESCE(msg_count.message_count, 0) AS message_count,
        sc.created_at,
        sc.updated_at
      FROM support_conversations sc
      LEFT JOIN support_guest_sessions sgs ON sgs.id = sc.guest_session_id
      LEFT JOIN support_messages lm ON lm.id = (
        SELECT sm_latest.id
        FROM support_messages sm_latest
        WHERE sm_latest.conversation_id = sc.id
        ORDER BY sm_latest.created_at DESC, sm_latest.id DESC
        LIMIT 1
      )
      LEFT JOIN (
        SELECT conversation_id, COUNT(*) AS message_count
        FROM support_messages
        GROUP BY conversation_id
      ) msg_count ON msg_count.conversation_id = sc.id
      LEFT JOIN (
        SELECT sm.conversation_id, COUNT(*) AS unread_count
        FROM support_messages sm
        INNER JOIN support_conversations unread_sc
          ON unread_sc.id = sm.conversation_id
          AND unread_sc.status = 'open'
        LEFT JOIN support_conversation_participants rp
          ON rp.conversation_id = sm.conversation_id
          AND rp.participant_type = ?
          AND rp.participant_id = ?
        WHERE sm.id > COALESCE(rp.last_read_message_id, 0)
          AND ${participantType === 'staff' ? "sm.sender_type IN ('guest', 'user')" : "sm.sender_type IN ('staff', 'admin', 'support')"}
        GROUP BY sm.conversation_id
      ) unread ON unread.conversation_id = sc.id
      ${whereClause}
      ORDER BY COALESCE(sc.last_message_at, sc.updated_at, sc.created_at) DESC, sc.id DESC
      LIMIT ? OFFSET ?
    `;

    const queryParams = [participantType, userId, ...params, limit, offset];
    logger.info('repository_get_conversations_execute', { user_id: userId, role, page, limit, filter_count: Object.keys(filters).length });
    const [rows] = await pool.execute(query, queryParams);
    return rows;
  }

  async getConversationCount(userId, role, filters = {}) {
    const where = [];
    const params = [];

    if (this.isStaffRole(role)) {
      if (filters.status && VALID_STATUSES.has(filters.status)) {
        where.push('status = ?');
        params.push(filters.status);
      }
      if (filters.mine) {
        where.push('assigned_admin_id = ?');
        params.push(userId);
      }
      if (filters.unassigned) {
        where.push('assigned_admin_id IS NULL');
      }
    } else {
      where.push('user_id = ?');
      params.push(userId);
      if (filters.status && VALID_STATUSES.has(filters.status)) {
        where.push('status = ?');
        params.push(filters.status);
      }
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.execute(`SELECT COUNT(*) AS count FROM support_conversations ${whereClause}`, params);
    return Number(rows[0]?.count || 0);
  }

  async getMessages(conversationId, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const [rows] = await pool.execute(
      'SELECT id, conversation_id, sender_type, sender_id, body, created_at, read_at FROM support_messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
      [conversationId, limit, offset]
    );
    return rows.reverse();
  }

  async getMessageCount(conversationId) {
    const [rows] = await pool.execute('SELECT COUNT(*) AS count FROM support_messages WHERE conversation_id = ?', [conversationId]);
    return Number(rows[0]?.count || 0);
  }

  async getConversationById(id) {
    const [rows] = await pool.execute('SELECT * FROM support_conversations WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async getConversationSummary(id, userId, role) {
    const rows = await this.getConversations(userId, role, {}, 1, 1);
    const summary = rows.find(row => Number(row.id) === Number(id));
    if (summary) return summary;

    const [fallback] = await pool.execute(`
      SELECT
        sc.id,
        sc.source,
        sc.status,
        sc.assigned_admin_id,
        NULL AS assigned_admin_name,
        CASE
          WHEN sc.source = 'guest' THEN COALESCE(NULLIF(sgs.name, ''), 'Guest')
          ELSE COALESCE(NULLIF(sc.subject, ''), 'Customer')
        END AS customer_name,
        CASE WHEN sc.source = 'guest' THEN sgs.email ELSE NULL END AS customer_email,
        NULL AS latest_message,
        NULL AS latest_message_sender_type,
        sc.last_message_at AS latest_message_at,
        0 AS unread_count,
        0 AS message_count,
        sc.created_at,
        sc.updated_at
      FROM support_conversations sc
      LEFT JOIN support_guest_sessions sgs ON sgs.id = sc.guest_session_id
      WHERE sc.id = ?
      LIMIT 1
    `, [id]);
    return fallback[0] || null;
  }

  async getUnreadCount(userId, role) {
    const participantType = this.isStaffRole(role) ? 'staff' : 'user';
    const unreadSenderClause = participantType === 'staff'
      ? "sm.sender_type IN ('guest', 'user')"
      : "sm.sender_type IN ('staff', 'admin', 'support')";
    const [rows] = await pool.execute(`
      SELECT COUNT(*) AS unread_count
      FROM support_messages sm
      INNER JOIN support_conversations sc
        ON sc.id = sm.conversation_id
        AND sc.status = 'open'
      LEFT JOIN support_conversation_participants rp
        ON rp.conversation_id = sm.conversation_id
        AND rp.participant_type = ?
        AND rp.participant_id = ?
      WHERE sm.id > COALESCE(rp.last_read_message_id, 0)
        AND ${unreadSenderClause}
    `, [participantType, userId]);
    return Number(rows[0]?.unread_count || 0);
  }

  canStaffModify(conversation, userId, role) {
    if (!conversation || !this.isStaffRole(role)) return false;
    if (this.isAdminRole(role)) return true;
    return Number(conversation.assigned_admin_id || 0) === Number(userId || 0);
  }

  async claimConversation(id, userId, role) {
    if (!this.isStaffRole(role)) throw new Error('Access denied');
    await pool.execute(
      'UPDATE support_conversations SET assigned_admin_id = COALESCE(assigned_admin_id, ?), updated_at = NOW() WHERE id = ?',
      [userId, id]
    );
    return this.getConversationById(id);
  }

  async releaseConversation(id, userId, role) {
    const conversation = await this.getConversationById(id);
    if (!this.canStaffModify(conversation, userId, role)) throw new Error('Access denied');
    await pool.execute('UPDATE support_conversations SET assigned_admin_id = NULL, updated_at = NOW() WHERE id = ?', [id]);
    return this.getConversationById(id);
  }

  async assignConversation(id, assignedAdminId, userId, role) {
    if (!this.isAdminRole(role)) throw new Error('Access denied');
    await pool.execute('UPDATE support_conversations SET assigned_admin_id = ?, updated_at = NOW() WHERE id = ?', [assignedAdminId || null, id]);
    return this.getConversationById(id);
  }

  async updateConversationStatus(id, status, userId, role) {
    if (!VALID_STATUSES.has(status)) throw new Error('Invalid status');
    const conversation = await this.getConversationById(id);
    if (!this.canStaffModify(conversation, userId, role)) throw new Error('Access denied');

    const updates = ['status = ?', 'updated_at = NOW()'];
    const values = [status];
    if (status === 'completed') updates.push('resolved_at = NOW()');
    if (status === 'closed') updates.push('closed_at = NOW()');
    if (status === 'open') updates.push('resolved_at = NULL', 'closed_at = NULL');
    values.push(id);

    await pool.execute(`UPDATE support_conversations SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.getConversationById(id);
  }

  async autoCloseGuestConversation(conversationId) {
    console.debug('[repo] auto-closing guest conversation:', conversationId);

    // Direct database update to avoid any access control issues
    const [existing] = await pool.execute(
      'SELECT status, source FROM support_conversations WHERE id = ?',
      [conversationId]
    );

    if (!existing || existing.length === 0) {
      console.debug('[repo] conversation not found for auto-close');
      return null;
    }

    const conversation = existing[0];
    if (conversation.status !== 'open') {
      console.debug('[repo] conversation not open, skipping auto-close. status:', conversation.status);
      return null;
    }
    if (conversation.source !== 'guest') {
      console.debug('[repo] conversation not guest source, skipping auto-close. source:', conversation.source);
      return null;
    }

    console.debug('[repo] performing auto-close update');
    await pool.execute(
      `UPDATE support_conversations SET status = 'closed', updated_at = NOW(), closed_at = NOW() WHERE id = ?`,
      [conversationId]
    );
    console.debug('[repo] auto-close update successful');
    return this.getConversationById(conversationId);
  }

  async markConversationRead(conversationId, role, participantId) {
    const participantType = this.isStaffRole(role) ? 'staff' : role === 'guest' ? 'guest' : 'user';
    const senderTypes = participantType === 'staff'
      ? ['guest', 'user']
      : participantType === 'guest'
        ? ['staff', 'admin', 'support']
        : ['staff', 'admin', 'support'];
    const placeholders = senderTypes.map(() => '?').join(',');
    const [msgRows] = await pool.execute(
      `SELECT id FROM support_messages WHERE conversation_id = ? AND sender_type IN (${placeholders}) ORDER BY id DESC LIMIT 1`,
      [conversationId, ...senderTypes]
    );
    const lastMessageId = msgRows[0]?.id || null;

    await pool.execute(`
      INSERT INTO support_conversation_participants
      (conversation_id, participant_type, participant_id, last_read_message_id, last_read_at, updated_at)
      VALUES (?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
      last_read_message_id = VALUES(last_read_message_id),
      last_read_at = NOW(),
      updated_at = NOW()
    `, [conversationId, participantType, participantId, lastMessageId]);

    return { lastMessageId, lastReadAt: new Date() };
  }

  async createMessage(conversationId, senderType, senderId, body) {
    const [result] = await pool.execute(
      'INSERT INTO support_messages (conversation_id, sender_type, sender_id, body, created_at) VALUES (?, ?, ?, ?, NOW())',
      [conversationId, senderType, senderId, body.trim()]
    );
    await this.updateConversationLastMessage(conversationId);
    const [rows] = await pool.execute(
      'SELECT id, conversation_id, sender_type, sender_id, body, created_at, read_at FROM support_messages WHERE id = ?',
      [result.insertId]
    );
    return rows[0];
  }

  isCustomerSenderType(senderType) {
    return CUSTOMER_SENDER_TYPES.has(String(senderType || '').toLowerCase());
  }

  async updateConversationLastMessage(conversationId) {
    await pool.execute(
      'UPDATE support_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ?',
      [conversationId]
    );
  }
}

module.exports = ConversationRepository;
