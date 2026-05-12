const jwt = require('jsonwebtoken');
const env = require('../config/env');

function generateGuestToken(sessionId, conversationId) {
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
    console.debug('[token-service] verifying guest token, length:', token.length);
    const decoded = jwt.verify(token, env.chatTokenSecret);
    if (decoded.type !== 'guest') {
      throw new Error('Invalid token type');
    }
    console.debug('[token-service] guest token verified, conversation:', decoded.conversation_id);
    return decoded;
  } catch (error) {
    console.debug('[token-service] guest token verification failed:', error.message);
    throw new Error(`Guest token verification failed: ${error.message}`);
  }
}

function verifyAuthToken(token) {
  try {
    console.debug('[token-service] verifying auth token, length:', token.length);
    const decoded = jwt.verify(token, env.chatTokenSecret);
    // Allow support_mobile tokens for mobile app
    if (decoded.type && decoded.type !== 'support_mobile' && decoded.type !== 'support') {
      throw new Error('Invalid token type for auth');
    }
    console.debug('[token-service] auth token verified, type:', decoded.type, 'user:', decoded.sub);
    return decoded;
  } catch (error) {
    console.debug('[token-service] auth token verification failed:', error.message);
    throw new Error(`Auth token verification failed: ${error.message}`);
  }
}

module.exports = {
  generateGuestToken,
  verifyGuestToken,
  verifyAuthToken
};