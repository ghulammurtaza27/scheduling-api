const pool = require('../config/database');

// Wraps database operations in a transaction
async function withTransaction(callback) {
  const client = await pool.connect();
  
  try {
    // Start transaction
    await client.query('BEGIN');

    // Execute the callback with transaction client
    const result = await callback(client);

    // Commit if successful
    await client.query('COMMIT');
    return result;

  } catch (err) {
    // Rollback on error
    await client.query('ROLLBACK');
    throw err;

  } finally {
    // Release client back to pool
    client.release();
  }
}

module.exports = { withTransaction }; 