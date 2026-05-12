const express = require('express');
const router = express.Router();
const GuestController = require('../controllers/guestController');
const { authenticateGuest } = require('../middleware/guestAuth');

const controller = new GuestController();

// POST /api/guest/conversations/start
router.post('/conversations/start', controller.startConversation.bind(controller));
router.get('/conversations/:id/messages', authenticateGuest, controller.getMessages.bind(controller));
router.post('/conversations/:id/end', authenticateGuest, controller.endConversation.bind(controller));

module.exports = router;
