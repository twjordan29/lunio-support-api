const { verifyAuthToken } = require('../services/tokenService');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const hasAuthHeader = !!authHeader;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    logger.info('auth_failure', {
      auth_failure_stage: 'missing_token',
      has_authorization_header: hasAuthHeader,
      route: `${req.method} ${req.path}`
    });
    return res.status(401).json({ ok: false, error: { message: 'Access token required', code: 'MISSING_TOKEN' } });
  }

  try {
    const user = verifyAuthToken(token);
    req.user = user;
    next();
  } catch (error) {
    let decodedHeader = null;
    let decodedPayload = null;
    try {
      const decoded = jwt.decode(token, { complete: true });
      decodedHeader = decoded?.header;
      decodedPayload = decoded?.payload;
    } catch (decodeError) {
      // Ignore decode errors for logging
    }

    const missingClaims = [];
    if (decodedPayload && !decodedPayload.sub) missingClaims.push('sub');
    if (decodedPayload && !decodedPayload.role) missingClaims.push('role');

    logger.info('auth_failure', {
      auth_failure_stage: 'token_verification',
      err_name: error.name,
      err_message: error.message,
      has_authorization_header: true,
      token_header_alg: decodedHeader?.alg,
      missing_claims: missingClaims.length > 0 ? missingClaims : undefined,
      route: `${req.method} ${req.path}`
    });

    return res.status(403).json({ ok: false, error: { message: 'Invalid access token', code: 'INVALID_TOKEN' } });
  }
}

module.exports = { authenticateToken };