// test/env-validator.test.js
const { expect } = require('chai');
const { validateEnv } = require('../utils/envValidator');

describe('Environment Validator', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should pass when all required vars are set', () => {
    process.env.MONGO_URI = 'mongodb://localhost:27017/test';
    process.env.JWT_ACTIVE_KID = 'test-key';

    const result = validateEnv();
    expect(result.isValid).to.be.true;
    expect(result.missing).to.have.length(0);
  });

  it('should fail when MONGO_URI is missing', () => {
    delete process.env.MONGO_URI;
    process.env.JWT_ACTIVE_KID = 'test-key';

    const result = validateEnv();
    expect(result.isValid).to.be.false;
    expect(result.missing.some(m => m.includes('MONGO_URI'))).to.be.true;
  });

  it('should fail on invalid MONGO_URI format', () => {
    process.env.MONGO_URI = 'http://not-a-mongo-uri';
    process.env.JWT_ACTIVE_KID = 'test-key';

    const result = validateEnv();
    expect(result.isValid).to.be.false;
  });

  it('should set defaults for optional vars', () => {
    process.env.MONGO_URI = 'mongodb://localhost:27017/test';
    process.env.JWT_ACTIVE_KID = 'test-key';
    delete process.env.PORT;
    delete process.env.HOST;

    const result = validateEnv();
    expect(result.isValid).to.be.true;
    expect(result.warnings.length).to.be.greaterThan(0);
  });
});
