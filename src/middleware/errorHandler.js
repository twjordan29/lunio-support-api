const logger = require('../utils/logger');
const env = require('../config/env');

module.exports = (err, req, res, next) => {
  const errorDetails = {
    name: err.name,
    message: err.message,
    code: err.code,
    errno: err.errno,
    sqlState: err.sqlState,
    sqlMessage: err.sqlMessage,
    route: `${req.method} ${req.path}`,
    stack: env.nodeEnv !== 'production' ? err.stack : err.stack?.split('\n')[0] // First line only in production
  };
  logger.error('Unhandled error', errorDetails);
  res.status(500).json({ error: 'Internal server error' });
};