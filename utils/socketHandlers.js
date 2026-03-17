const { Server } = require('socket.io');
const { verifyAccessToken, ACCESS_COOKIE_NAME } = require('./jwtAuth');
const { parseCookies } = require('./sessionStore');
const User = require('../models/User');
const logger = require('./logger');

/**
 * Create socket.io server and attach handlers.
 * @param {import('http').Server} httpServer
 * @param {import('express').Application} app
 * @returns {Server}
 */
function initSocketIO(httpServer, app) {
  const io = new Server(httpServer);
  app.set('io', io);

  io.on('connection', (socket) => {
    // Authenticate socket from cookies
    let socketUser = null;
    try {
      const cookieHeader = socket.handshake.headers.cookie || '';
      const cookies = parseCookies(cookieHeader);
      const accessToken = cookies[ACCESS_COOKIE_NAME];
      if (accessToken) {
        const payload = verifyAccessToken(accessToken);
        if (payload && payload.sub) {
          socketUser = { id: payload.sub, email: payload.email };
        }
      }
    } catch (_) { /* unauthenticated socket */ }

    socket.on('identify', async (email) => {
      try {
        if (!email) return;
        if (!socketUser || socketUser.email !== email) return;
        socket.join(email);
        socket.userEmail = email;
        const user = await User.findOne({ email });
        if (user) {
          user.online = true;
          await user.save();
        }
        io.emit('presence', { email, online: true });
      } catch (e) {
        logger.error('identify error', e);
      }
    });

    socket.on('disconnect', async () => {
      try {
        const email = socket.userEmail;
        if (email) {
          const user = await User.findOne({ email });
          if (user) {
            user.online = false;
            user.lastOnline = new Date();
            await user.save();
          }
          io.emit('presence', { email, online: false, lastOnline: user ? user.lastOnline : new Date() });
        }
      } catch (e) { logger.error('disconnect error', e); }
    });
  });

  return io;
}

module.exports = { initSocketIO };
