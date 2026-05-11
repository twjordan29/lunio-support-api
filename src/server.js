const http = require('http');
const socketIo = require('socket.io');
const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const setupSockets = require('./sockets');

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: env.corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Setup Socket.IO handlers
setupSockets(io);

// Start server
server.listen(env.port, () => {
  logger.info(`Lunio Support API server running`, {
    port: env.port,
    environment: env.nodeEnv,
    corsOrigin: env.corsOrigin
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = server;