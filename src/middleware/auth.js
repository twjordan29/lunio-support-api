const { verifyAuthToken } = require('../services/tokenService');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: { message: 'Access token required', code: 'MISSING_TOKEN' } });
  }

  try {
    const user = verifyAuthToken(token);
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ ok: false, error: { message: 'Invalid access token', code: 'INVALID_TOKEN' } });
  }
}

module.exports = { authenticateToken };