const { verifyGuestToken } = require('../utils/guestToken');

function authenticateGuest(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: { message: 'Guest token required', code: 'MISSING_TOKEN' } });
  }

  try {
    const guest = verifyGuestToken(token);
    req.guest = guest;
    next();
  } catch (error) {
    return res.status(403).json({ ok: false, error: { message: 'Invalid guest token', code: 'INVALID_TOKEN' } });
  }
}

module.exports = { authenticateGuest };