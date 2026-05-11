const express = require('express');
const router = express.Router();
const ConversationController = require('../controllers/conversationController');
const { authenticateToken } = require('../middleware/auth');

const controller = new ConversationController();

// GET /api/conversations
router.get('/conversations', authenticateToken, controller.getConversations.bind(controller));

// GET /api/conversations/:id/messages
router.get('/conversations/:id/messages', authenticateToken, controller.getMessages.bind(controller));

// POST /api/conversations/:id/read
router.post('/conversations/:id/read', authenticateToken, controller.markRead.bind(controller));

// POST /api/conversations/:id/messages
router.post('/conversations/:id/messages', authenticateToken, controller.sendMessage.bind(controller));

// PATCH /api/conversations/:id/status
router.patch('/conversations/:id/status', authenticateToken, controller.updateStatus.bind(controller));

// PATCH /api/conversations/:id/assignment
router.patch('/conversations/:id/assignment', authenticateToken, controller.updateAssignment.bind(controller));

module.exports = router;