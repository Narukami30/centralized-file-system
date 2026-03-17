// utils/logger.js
// Structured logging with winston

const winston = require('winston');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'centralized-file-system' },
  transports: [
    // Console transport — human-readable in dev, JSON in production
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length > 1 // 'service' is default
                ? ' ' + JSON.stringify(meta, null, 0)
                : '';
              return `[${timestamp}] ${level}: ${message}${metaStr}`;
            })
          )
    }),
    // File transport — combined log
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    // File transport — errors only
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      tailable: true
    })
  ]
});

module.exports = logger;
