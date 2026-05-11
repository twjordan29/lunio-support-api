const logger = require('../utils/logger');

module.exports = (io) => {
  io.on('connection', (socket) => {
    logger.info('Client connected', { socketId: socket.id });

    socket.emit('connected', { message: 'Successfully connected to Lunio Support API' });

    socket.on('disconnect', (reason) => {
      logger.info('Client disconnected', { socketId: socket.id, reason });
    });
  });
};