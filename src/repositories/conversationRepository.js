const pool = require('../config/db');

class ConversationRepository {
  async getConversations(userId, role, page = 1, limit = 25) {
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [userId, limit, offset];

    if (role === 'user') {
      whereClause = 'WHERE sc.user_id = ?';
    } else {
      // admin/support see all
    }

    const query = `
      SELECT
        sc.*,
        (SELECT body FROM support_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) as latest_message,
        (SELECT sender_type FROM support_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) as latest_message_sender_type,
        (SELECT created_at FROM support_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) as latest_message_at,
        (SELECT COUNT(*) FROM support_messages sm WHERE sm.conversation_id = sc.id) as message_count,
        COALESCE((
          SELECT COUNT(*) FROM support_messages sm
          WHERE sm.conversation_id = sc.id
          AND sm.id > COALESCE((
            SELECT last_read_message_id FROM support_conversation_participants scp
            WHERE scp.conversation_id = sc.id AND scp.participant_type = ? AND scp.participant_id = ?
          ), 0)
        ), 0) as unread_count
      FROM support_conversations sc
      ${whereClause}
      ORDER BY sc.last_message_at DESC, sc.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const participantType = role === 'user' ? 'user' : 'staff';
    params.splice(1, 0, participantType, userId); // Insert before limit

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  async getConversationCount(userId, role) {
    let whereClause = '';
    let params = [userId];

    if (role === 'user') {
      whereClause = 'WHERE user_id = ?';
    }

    const [rows] = await pool.execute(`SELECT COUNT(*) as count FROM support_conversations ${whereClause}`, params);
    return rows[0].count;
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