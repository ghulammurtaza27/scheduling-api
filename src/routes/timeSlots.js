const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { body, query, param, validationResult } = require('express-validator');

// Validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      errors: errors.array() 
    });
  }
  next();
};

// Create time slot(s) - supports both single and recurring
router.post('/', [
  body('consultant_id').isUUID().notEmpty(),
  body('start_time').isISO8601().notEmpty(),
  body('end_time').isISO8601().notEmpty(),
  body('start_time').custom((value, { req }) => {
    if (new Date(value) < new Date()) {
      throw new Error('Start time must be in the future');
    }
    return true;
  }),
  body('end_time').custom((value, { req }) => {
    if (new Date(value) <= new Date(req.body.start_time)) {
      throw new Error('End time must be after start time');
    }
    return true;
  }),
  body('recurring.frequency').optional().isIn(['weekly', 'monthly']),
  body('recurring.day_of_week')
    .optional()
    .isInt({ min: 0, max: 6 })
    .custom((value, { req }) => {
      if (req.body.recurring?.frequency === 'weekly' && value === undefined) {
        throw new Error('day_of_week is required for weekly recurring slots');
      }
      return true;
    }),
  body('recurring.day_of_month')
    .optional()
    .isInt({ min: 1, max: 31 })
    .custom((value, { req }) => {
      if (req.body.recurring?.frequency === 'monthly' && value === undefined) {
        throw new Error('day_of_month is required for monthly recurring slots');
      }
      return true;
    }),
  body('recurring.until')
    .optional()
    .isISO8601()
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.start_time)) {
        throw new Error('Until date must be after start time');
      }
      return true;
    }),
  validateRequest
], async (req, res) => {
  const { consultant_id, start_time, end_time, recurring } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (recurring) {
      try {
        // Handle recurring time slots
        const recurringPattern = await client.query(
          `INSERT INTO recurring_patterns 
           (frequency, day_of_week, day_of_month, until_date)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [recurring.frequency, recurring.day_of_week, 
           recurring.day_of_month, recurring.until]
        );

        // Generate all instances of recurring slots up to until_date
        const pattern_id = recurringPattern.rows[0].id;
        await client.query(
          `SELECT create_recurring_slots($1::uuid, $2::timestamp, $3::timestamp, $4::uuid, $5::timestamp)`,
          [consultant_id, start_time, end_time, pattern_id, recurring.until]
        );
      } catch (err) {
        console.error('Recurring slot creation failed:', err);
        throw err;
      }
    } else {
      // Handle single time slot
      const overlapCheck = await client.query(
        `SELECT * FROM time_slots
         WHERE consultant_id = $1
           AND (
             (start_time <= $3 AND end_time > $2) OR
             (start_time < $3 AND end_time >= $2) OR
             (start_time >= $2 AND end_time <= $3)
           )`,
        [consultant_id, start_time, end_time]
      );

      if (overlapCheck.rows.length > 0) {
        throw new Error('Time slot overlaps with existing slots');
      }

      await client.query(
        `INSERT INTO time_slots 
         (consultant_id, start_time, end_time)
         VALUES ($1, $2, $3)`,
        [consultant_id, start_time, end_time]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: recurring ? 'Recurring slots created' : 'Time slot created'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Time slot creation failed:', err);
    
    let statusCode = 400;
    if (err.code === '23505') statusCode = 409; // Unique violation
    if (err.code === '23503') statusCode = 404; // Foreign key violation
    
    res.status(statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  } finally {
    client.release();
  }
});

// Get available time slots with multiple filter options
router.get('/', [
  query('consultant_id').optional().isUUID(),
  query('date').optional().isDate(),
  query('month').optional().matches(/^\d{4}-(0[1-9]|1[0-2])$/),
  query('start_date')
    .optional()
    .isDate()
    .custom((value, { req }) => {
      if (value && req.query.end_date && value > req.query.end_date) {
        throw new Error('Start date must be before end date');
      }
      return true;
    }),
  query('end_date').optional().isDate(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validateRequest
], async (req, res) => {
  const { 
    consultant_id, 
    date, 
    month, 
    start_date, 
    end_date,
    page = 1,
    limit = 20
  } = req.query;

  try {
    let baseQuery = `
      SELECT ts.*, 
             COALESCE(c.name, 'Unknown') as consultant_name,
             rp.frequency,
             rp.day_of_week,
             rp.day_of_month
      FROM time_slots ts
      LEFT JOIN consultants c ON ts.consultant_id = c.id
      LEFT JOIN recurring_patterns rp ON ts.recurring_pattern_id = rp.id
      WHERE ts.is_booked = FALSE
    `;
    const queryParams = [];
    let paramCount = 1;

    if (consultant_id) {
      baseQuery += ` AND ts.consultant_id = $${paramCount}`;
      queryParams.push(consultant_id);
      paramCount++;
    }

    if (date) {
      baseQuery += ` AND DATE(ts.start_time) = $${paramCount}`;
      queryParams.push(date);
      paramCount++;
    }

    if (month) {
      const [year, monthNum] = month.split('-');
      baseQuery += ` AND EXTRACT(YEAR FROM ts.start_time) = $${paramCount}
                 AND EXTRACT(MONTH FROM ts.start_time) = $${paramCount + 1}`;
      queryParams.push(year, monthNum);
      paramCount += 2;
    }

    if (start_date) {
      baseQuery += ` AND DATE(ts.start_time) >= $${paramCount}`;
      queryParams.push(start_date);
      paramCount++;
    }

    if (end_date) {
      baseQuery += ` AND ts.end_time <= $${paramCount}`;
      queryParams.push(end_date);
      paramCount++;
    }

    // Count total items
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM (${baseQuery}) AS count_query`,
      queryParams
    );

    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / limit);

    // Add pagination to base query
    const offset = (page - 1) * limit;
    const finalQuery = `${baseQuery} 
      ORDER BY ts.start_time 
      LIMIT ${limit} OFFSET ${offset}`;

    const result = await pool.query(finalQuery, queryParams);

    res.json({
      success: true,
      data: {
        time_slots: result.rows,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: totalItems,
          limit: parseInt(limit)
        }
      }
    });
  } catch (err) {
    console.error('GET time slots failed:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch time slots',
      details: err.message
    });
  }
});

// Reserve a time slot
router.post('/:slotId/reserve', [
  param('slotId').isUUID(),
  body('customer_id').isUUID().notEmpty(),
  param('slotId').custom(async (value) => {
    const slot = await pool.query(
      'SELECT is_booked, start_time FROM time_slots WHERE id = $1',
      [value]
    );
    if (slot.rows.length === 0) {
      throw new Error('Time slot not found');
    }
    if (slot.rows[0].is_booked) {
      throw new Error('Time slot is already booked');
    }
    if (new Date(slot.rows[0].start_time) < new Date()) {
      throw new Error('Cannot book past time slots');
    }
    return true;
  }),
  body('customer_id').custom(async (value) => {
    const customer = await pool.query(
      'SELECT id FROM customers WHERE id = $1',
      [value]
    );
    if (customer.rows.length === 0) {
      throw new Error('Customer not found');
    }
    return true;
  }),
  validateRequest
], async (req, res) => {
  const { customer_id } = req.body;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const checkResult = await client.query(
      `SELECT * FROM time_slots
       WHERE id = $1 AND is_booked = FALSE
       FOR UPDATE`,
      [req.params.slotId]
    );
    
    if (checkResult.rows.length === 0) {
      throw new Error('Time slot is not available');
    }
    
    const result = await client.query(
      `UPDATE time_slots
       SET is_booked = TRUE, 
           customer_id = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [customer_id, req.params.slotId]
    );
    
    await client.query('COMMIT');
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({
      success: false,
      error: 'Reservation failed',
      details: err.message
    });
  } finally {
    client.release();
  }
});

// Delete a time slot
router.delete('/:slotId', [
  param('slotId').isUUID(),
  param('slotId').custom(async (value) => {
    const slot = await pool.query(
      'SELECT is_booked, start_time FROM time_slots WHERE id = $1',
      [value]
    );
    if (slot.rows.length === 0) {
      throw new Error('Time slot not found');
    }
    if (slot.rows[0].is_booked) {
      throw new Error('Cannot delete booked time slots');
    }
    if (new Date(slot.rows[0].start_time) < new Date()) {
      throw new Error('Cannot delete past time slots');
    }
    return true;
  }),
  validateRequest
], async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Check if slot is part of recurring pattern
    const slotCheck = await client.query(
      `SELECT recurring_pattern_id FROM time_slots WHERE id = $1`,
      [req.params.slotId]
    );

    if (slotCheck.rows.length === 0) {
      throw new Error('Time slot not found');
    }

    if (slotCheck.rows[0].recurring_pattern_id) {
      // Delete all future instances of recurring slot
      await client.query(
        `DELETE FROM time_slots
         WHERE recurring_pattern_id = $1
           AND start_time >= NOW()
           AND is_booked = FALSE`,
        [slotCheck.rows[0].recurring_pattern_id]
      );
    } else {
      // Delete single slot
      await client.query(
        `DELETE FROM time_slots 
         WHERE id = $1 AND is_booked = FALSE`,
        [req.params.slotId]
      );
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: 'Time slot(s) deleted successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({
      success: false,
      error: 'Delete failed',
      details: err.message
    });
  } finally {
    client.release();
  }
});



module.exports = router;