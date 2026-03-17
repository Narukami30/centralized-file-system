// utils/errorHandler.js
// Centralized error response format for JSON API and HTML responses

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

/**
 * Create standardized JSON error response
 */
function errorResponse(res, { statusCode = 500, code = 'INTERNAL_ERROR', message = 'Internal server error', details = null }) {
  const body = {
    success: false,
    error: {
      code,
      message,
      timestamp: new Date().toISOString()
    }
  };
  if (details) body.error.details = details;
  return res.status(statusCode).json(body);
}

/**
 * Express global error handler middleware
 */
function globalErrorHandler(err, req, res, _next) {
  const logger = require('./logger');

  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.isOperational ? err.message : 'Internal server error';

  // Log the error
  if (statusCode >= 500) {
    logger.error('Server error', {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      code,
      stack: err.stack,
      userId: req.user && req.user._id
    });
  } else {
    logger.warn('Client error', {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      code,
      message: err.message
    });
  }

  // JSON response for API / XHR requests
  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return errorResponse(res, { statusCode, code, message });
  }

  // HTML response for browser requests
  res.status(statusCode).send(
    `<h2>Error ${statusCode}</h2><p>${message}</p>`
  );
}

module.exports = { AppError, errorResponse, globalErrorHandler };
