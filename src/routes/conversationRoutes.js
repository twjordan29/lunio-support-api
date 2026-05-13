const express = require('express');
const router = express.Router();
const ConversationController = require('../controllers/conversationController');
const { authenticateToken } = require('../middleware/auth');

const controller = new ConversationController();

router.get('/conversations/unread-count', authenticateToken, controller.getUnreadCount.bind(controller));
router.get('/conversations', authenticateToken, controller.getConversations.bind(controller));
router.get('/conversations/:id/messages', authenticateToken, controller.getMessages.bind(controller));
router.post('/conversations/:id/messages', authenticateToken, controller.sendMessage.bind(controller));
router.post('/conversations/:id/read', authenticateToken, controller.markRead.bind(controller));
router.post('/conversations/:id/claim', authenticateToken, controller.claim.bind(controller));
router.post('/conversations/:id/release', authenticateToken, controller.release.bind(controller));
router.post('/conversations/:id/assign', authenticateToken, controller.assign.bind(controller));
router.post('/conversations/:id/status', authenticateToken, controller.updateStatus.bind(controller));

// Backward-compatible aliases for older admin clients.
router.patch('/conversations/:id/status', authenticateToken, controller.updateStatus.bind(controller));
router.patch('/conversations/:id/assignment', authenticateToken, controller.assign.bind(controller));

module.exports = router;
