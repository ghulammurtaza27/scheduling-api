const pool = require('../config/database');

beforeAll(async () => {
  // Ensure we're using test database
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Tests must be run in test environment');
  }
});

// Increase timeout for async operations
jest.setTimeout(30000); // Increased timeout to 30 seconds