const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const logger = require('./utils/logger');
const healthRoutes = require('./routes/health.routes');
const apiRoutes = require('./routes/api.routes');
const guestRoutes = require('./routes/guest.routes');

const app = express();

// Security middleware
app.use(helmet());

// CORS middleware
app.use(cors({
  origin: env.corsOrigin,
  credentials: true
}));

// JSON middleware
app.use(express.json());

// Routes
app.use('/', healthRoutes);
app.use('/api', apiRoutes);
app.use('/api/guest', guestRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;