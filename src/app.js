const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const logger = require('./utils/logger');
const healthRoutes = require('./routes/healthRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const guestRoutes = require('./routes/guestRoutes');

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
app.use('/api', conversationRoutes);
app.use('/api/guest', guestRoutes);

// Error handling middleware
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

module.exports = app;