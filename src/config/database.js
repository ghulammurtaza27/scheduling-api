const { Pool } = require('pg');

const isTest = process.env.NODE_ENV === 'test';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  database: isTest ? 'timeslots_test' : process.env.DB_NAME,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.NODE_ENV === 'production'
});

// Add error handler
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;