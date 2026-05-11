const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const logger = require('../utils/logger');
const { authenticateToken } = require('../utils/auth');

// GET /api/conversations
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const { sub: userId, role, company_id: companyId } = req.user;
    let query;
    let params;

    if (role === 'user') {
      query = `
        SELECT
          sc.*,
          (SELECT body FROM support_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) as latest_message
        FROM support_conversations sc
        WHERE sc.user_id = ?
        ORDER BY sc.last_message_at DESC, sc.created_at DESC
      `;
      params = [userId];
    } else {
      // admin/support can see all
      query = `
        SELECT
          sc.*,
          (SELECT body FROM support_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) as latest_message
        FROM support_conversations sc
        ORDER BY sc.last_message_at DESC, sc.created_at DESC
      `;
      params = [];
    }

    const [conversations] = await pool.execute(query, params);
    res.json({ conversations });
  } catch (error) {
    logger.error('Error fetching conversations', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/conversations/:id/messages
router.get('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const { sub: userId, role } = req.user;

    // Check access
    if (role === 'user') {
      const [conv] = await pool.execute('SELECT user_id FROM support_conversations WHERE id = ?', [conversationId]);
      if (conv.length === 0 || conv[0].user_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Get messages, exclude internal for users
    const excludeInternal = role === 'user' ? 'AND is_internal = 0' : '';
    const [messages] = await pool.execute(
      `SELECT * FROM support_messages WHERE conversation_id = ? ${excludeInternal} ORDER BY created_at ASC`,
      [conversationId]
    );

    res.json({ messages });
  } catch (error) {
    logger.error('Error fetching messages', { error: error.message, conversationId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;