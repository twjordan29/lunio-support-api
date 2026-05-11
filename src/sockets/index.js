const logger = require('../utils/logger');
const { verifyChatToken } = require('../utils/chatToken');

module.exports = (io) => {
  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const user = verifyChatToken(token);
      socket.data.user = user;
      next();
    } catch (error) {
      next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    logger.info('Client connected', {
      socketId: socket.id,
      userId: user.sub,
      role: user.role,
      companyId: user.company_id
    });

    socket.emit('support:connected', {
      ok: true,
      user_id: user.sub,
      role: user.role,
      company_id: user.company_id
    });

    socket.on('disconnect', (reason) => {
      logger.info('Client disconnected', {
        socketId: socket.id,
        userId: user.sub,
        role: user.role,
        companyId: user.company_id,
        reason
      });
    });
  });
};