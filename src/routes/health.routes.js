const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../utils/logger');
const pool = require('../config/database');

router.get('/health', (req, res) => {
  const response = {
    ok: true,
    service: env.appName,
    environment: env.nodeEnv,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
  logger.info('Health check requested', response);
  res.json(response);
});

router.get('/health/db', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT 1');
    const response = {
      ok: true,
      service: env.appName,
      environment: env.nodeEnv,
      database: {
        connected: true,
        host: env.db.host,
        database: env.db.database
      },
      timestamp: new Date().toISOString()
    };
    logger.info('Database health check successful', response);
    res.json(response);
  } catch (error) {
    logger.error('Database health check failed', { error: error.message });
    res.status(500).json({
      ok: false,
      service: env.appName,
      environment: env.nodeEnv,
      database: {
        connected: false,
        error: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/dev/test-token', (req, res) => {
  if (env.nodeEnv === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const payload = {
    sub: 1,
    company_id: 1,
    role: 'admin',
    name: 'Dev Admin',
    email: 'dev@example.test',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
  };

  const token = jwt.sign(payload, env.chatTokenSecret);
  logger.info('Dev test token generated', { userId: payload.sub });
  res.json({ token });
});

module.exports = router;