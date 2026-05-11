const express = require('express');
const router = express.Router();
const GuestController = require('../controllers/guestController');

const controller = new GuestController();

// POST /api/guest/conversations/start
router.post('/conversations/start', controller.startConversation.bind(controller));

module.exports = router;