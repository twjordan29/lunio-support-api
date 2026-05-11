const jwt = require('jsonwebtoken');
const env = require('../config/env');

function generateGuestToken(sessionId, conversationId = null) {
  const payload = {
    type: 'guest',
    session_id: sessionId,
    conversation_id: conversationId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 7 // 7 days
  };

  return jwt.sign(payload, env.chatTokenSecret);
}

function verifyGuestToken(token) {
  try {
    const decoded = jwt.verify(token, env.chatTokenSecret);
    if (decoded.type !== 'guest') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    throw new Error(`Guest token verification failed: ${error.message}`);
  }
}

module.exports = {
  generateGuestToken,
  verifyGuestToken
};