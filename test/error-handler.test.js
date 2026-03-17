// test/error-handler.test.js
const { expect } = require('chai');
const { AppError, errorResponse } = require('../utils/errorHandler');

describe('Error Handler', () => {
  describe('AppError', () => {
    it('should create an operational error with status code', () => {
      const err = new AppError('Not found', 404, 'NOT_FOUND');
      expect(err.message).to.equal('Not found');
      expect(err.statusCode).to.equal(404);
      expect(err.code).to.equal('NOT_FOUND');
      expect(err.isOperational).to.be.true;
    });

    it('should default to 500 status code', () => {
      const err = new AppError('Server error');
      expect(err.statusCode).to.equal(500);
      expect(err.code).to.equal('INTERNAL_ERROR');
    });

    it('should be an instance of Error', () => {
      const err = new AppError('Test');
      expect(err).to.be.instanceOf(Error);
    });
  });

  describe('errorResponse', () => {
    it('should format a JSON error response', () => {
      let sentStatus = null;
      let sentBody = null;
      const mockRes = {
        status(code) { sentStatus = code; return this; },
        json(body) { sentBody = body; return this; }
      };

      errorResponse(mockRes, {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid input'
      });

      expect(sentStatus).to.equal(400);
      expect(sentBody.success).to.be.false;
      expect(sentBody.error.code).to.equal('VALIDATION_ERROR');
      expect(sentBody.error.message).to.equal('Invalid input');
      expect(sentBody.error.timestamp).to.be.a('string');
    });

    it('should include details when provided', () => {
      let sentBody = null;
      const mockRes = {
        status() { return this; },
        json(body) { sentBody = body; return this; }
      };

      errorResponse(mockRes, {
        statusCode: 422,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: { field: 'email', reason: 'required' }
      });

      expect(sentBody.error.details).to.deep.equal({ field: 'email', reason: 'required' });
    });
  });
});
