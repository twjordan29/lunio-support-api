const jwt = require('jsonwebtoken');
const env = require('../config/env');

function verifyChatToken(token) {
  try {
    const decoded = jwt.verify(token, env.chatTokenSecret);
    return decoded;
  } catch (error) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

module.exports = {
  verifyChatToken
};