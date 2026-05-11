const express = require('express');
const router = express.Router();
const GuestController = require('../controllers/guestController');
const { authenticateGuest } = require('../middleware/guestAuth');

const controller = new GuestController();

// POST /guest/token
router.post('/token', controller.createToken.bind(controller));

// POST /guest/conversations
router.post('/conversations', authenticateGuest, controller.createConversation.bind(controller));

// GET /guest/conversations/:id/messages
router.get('/conversations/:id/messages', authenticateGuest, controller.getMessages.bind(controller));

// POST /guest/conversations/:id/messages
router.post('/conversations/:id/messages', authenticateGuest, controller.sendMessage.bind(controller));

module.exports = router;