const pool = require('../config/db');
const logger = require('../utils/logger');

class ConversationRepository {
  async getConversations(userId, role, page = 1, limit = 25) {
    try {
      logger.info('repository_get_conversations_started', { user_id: userId, role, page, limit });

      const offset = (page - 1) * limit;

      let whereClause = '';
      let params = [];

      if (role === 'user') {
        whereClause = 'WHERE sc.user_id = ?';
      } else {
        // admin/support see all
      }

      // Temporary simplified query for debugging
      const query = `
        SELECT
          sc.*
        FROM support_conversations sc
        ${whereClause}
        ORDER BY sc.created_at DESC
        LIMIT ? OFFSET ?
      `;

      if (role === 'user') {
        params.push(userId);
      }
      params.push(limit, offset);

      logger.info('repository_sql_execute', { user_id: userId, role, param_count: params.length });
      const [rows] = await pool.execute(query, params);
      logger.info('repository_get_conversations_success', { user_id: userId, role, row_count: rows.length });

      return rows;
    } catch (error) {
      logger.error('repository_get_conversations_failed', {
        user_id: userId,
        role,
        page,
        limit,
        err_message: error.message,
        err_code: error.code,
        err_errno: error.errno,
        err_sqlState: error.sqlState,
        err_sqlMessage: error.sqlMessage
      });
      throw error;
    }
  }

  async getConversationCount(userId, role) {
    try {
      let whereClause = '';
      let params = [];

      if (role === 'user') {
        whereClause = 'WHERE user_id = ?';
        params.push(userId);
      }

      const query = `SELECT COUNT(*) as count FROM support_conversations ${whereClause}`;
      logger.info('repository_get_conversation_count_execute', { user_id: userId, role });
      const [rows] = await pool.execute(query, params);
      logger.info('repository_get_conversation_count_success', { user_id: userId, role, count: rows[0].count });

      return rows[0].count;
    } catch (error) {
      logger.error('repository_get_conversation_count_failed', {
        user_id: userId,
        role,
        err_message: error.message,
        err_code: error.code,
        err_errno: error.errno,
        err_sqlState: error.sqlState,
        err_sqlMessage: error.sqlMessage
      });
      throw error;
    }
  }

  async getMessages(conversationId, page = 1, limit = 25) {
    const offset = (page - 1) * limit;
    const [rows] = await pool.execute(
      'SELECT * FROM support_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [conversationId, limit, offset]
    );
    return rows.reverse(); // Since we selected DESC but want ASC
  }

  async getMessageCount(conversationId) {
    const [rows] = await pool.execute('SELECT COUNT(*) as count FROM support_messages WHERE conversation_id = ?', [conversationId]);
    return rows[0].count;
  }

  async getConversationById(id) {
    const [rows] = await pool.execute('SELECT * FROM support_conversations WHERE id = ?', [id]);
    return rows[0];
  }

  async updateConversationStatus(id, status, userRole) {
    if (userRole === 'user') {
      throw new Error('Access denied');
    }

    const updates = { status };
    if (status === 'resolved') {
      updates.resolved_at = new Date();
    } else if (status === 'closed') {
      updates.closed_at = new Date();
    }

    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);

    await pool.execute(`UPDATE support_conversations SET ${setClause}, updated_at = NOW() WHERE id = ?`, values);
    return this.getConversationById(id);
  }

  async updateConversationAssignment(id, assignedAdminId, userRole) {
    if (userRole === 'user') {
      throw new Error('Access denied');
    }

    await pool.execute('UPDATE support_conversations SET assigned_admin_id = ?, updated_at = NOW() WHERE id = ?', [assignedAdminId, id]);
    return this.getConversationById(id);
  }

  async markConversationRead(conversationId, role, participantId) {
    const participantType = role === 'user' ? 'user' : 'staff';
    // Get latest message id
    const [msgRows] = await pool.execute(
      'SELECT id FROM support_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1',
      [conversationId]
    );
    const lastMessageId = msgRows[0]?.id || null;

    // Upsert participant
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

  async getUnreadCount(userId, role) {
    const participantType = role === 'user' ? 'user' : 'staff';

    const query = `
      SELECT COUNT(*) as unread_count FROM support_messages sm
      LEFT JOIN support_conversation_participants scp
        ON sm.conversation_id = scp.conversation_id
        AND scp.participant_type = ?
        AND scp.participant_id = ?
      WHERE sm.id > COALESCE(scp.last_read_message_id, 0)
      ${role === 'user' ? 'AND sm.conversation_id IN (SELECT id FROM support_conversations WHERE user_id = ?)' : ''}
    `;

    const params = [participantType, userId];
    if (role === 'user') params.push(userId);

    const [rows] = await pool.execute(query, params);
    return rows[0].unread_count;
  }

  async createConversation(userId, companyId, subject) {
    const [result] = await pool.execute(
      'INSERT INTO support_conversations (user_id, company_id, subject, status) VALUES (?, ?, ?, ?)',
      [userId, companyId || null, subject || null, 'open']
    );
    return result.insertId;
  }

  async createMessage(conversationId, senderType, senderId, body) {
    const [result] = await pool.execute(
      'INSERT INTO support_messages (conversation_id, sender_type, sender_id, body) VALUES (?, ?, ?, ?)',
      [conversationId, senderType, senderId, body.trim()]
    );
    return result.insertId;
  }

  async updateConversationLastMessage(conversationId) {
    await pool.execute(
      'UPDATE support_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ?',
      [conversationId]
    );
  }
}

module.exports = ConversationRepository;
