const pino = require('pino');
const env = require('../config/env');

const logger = pino({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;