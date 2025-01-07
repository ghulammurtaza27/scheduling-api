const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { param, validationResult, body } = require('express-validator');
const { timeSlotCreate, timeSlotQuery, slotReservation } = require('../middleware/validation');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

router.post('/', timeSlotCreate, validateRequest, async (req, res) => {
  const { consultant_id, start_time, end_time, recurring } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    let actualStartTime, actualEndTime;

    if (recurring) {
      const [startHours, startMinutes] = start_time.split(':');
      const [endHours, endMinutes] = end_time.split(':');
      
      actualStartTime = new Date();
      actualEndTime = new Date();

      if (recurring.day_of_week !== undefined) {
        const targetDay = recurring.day_of_week;
        const currentDay = actualStartTime.getUTCDay();
        const daysToAdd = (targetDay - currentDay + 7) % 7;
        actualStartTime.setDate(actualStartTime.getDate() + daysToAdd);
        actualEndTime.setDate(actualEndTime.getDate() + daysToAdd);
      }

      actualStartTime.setUTCHours(parseInt(startHours), parseInt(startMinutes), 0, 0);
      actualEndTime.setUTCHours(parseInt(endHours), parseInt(endMinutes), 0, 0);

      const recurringPattern = await client.query(
        `INSERT INTO recurring_patterns 
         (frequency, day_of_week, day_of_month, until_date)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [recurring.frequency, recurring.day_of_week, recurring.day_of_month, recurring.until]
      );

      await client.query(
        `SELECT create_recurring_slots($1::uuid, $2::timestamp, $3::timestamp, $4::uuid, $5::timestamp)`,
        [consultant_id, actualStartTime, actualEndTime, recurringPattern.rows[0].id, recurring.until]
      );

      result = await client.query(
        `SELECT * FROM time_slots 
         WHERE recurring_pattern_id = $1 
         ORDER BY start_time ASC LIMIT 1`,
        [recurringPattern.rows[0].id]
      );
    } else {
      actualStartTime = new Date(start_time);
      actualEndTime = new Date(end_time);

      const overlapCheck = await client.query(
        `SELECT * FROM time_slots
         WHERE consultant_id = $1
           AND (
             (start_time <= $3 AND end_time > $2) OR
             (start_time < $3 AND end_time >= $2) OR
             (start_time >= $2 AND end_time <= $3)
           )`,
        [consultant_id, actualStartTime, actualEndTime]
      );

      if (overlapCheck.rows.length > 0) {
        throw new Error('Time slot overlaps with existing slots');
      }

      result = await client.query(
        `INSERT INTO time_slots 
         (consultant_id, start_time, end_time)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [consultant_id, actualStartTime, actualEndTime]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: recurring ? 'Recurring slots created' : 'Time slot created',
      data: {
        consultant_id,
        start_time,
        end_time,
        recurring: recurring ? {
          frequency: recurring.frequency,
          day_of_week: recurring.day_of_week,
          day_of_month: recurring.day_of_month,
          until: recurring.until
        } : null
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    
    let statusCode = 400;
    if (err.code === '23505') statusCode = 409;
    if (err.code === '23503') statusCode = 404;
    
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

router.get('/', timeSlotQuery, validateRequest, async (req, res) => {
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

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM (${baseQuery}) AS count_query`,
      queryParams
    );

    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / limit);
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

router.post('/:slotId/reserve', slotReservation, validateRequest, async (req, res) => {
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
      details: err.message
    });
  } finally {
    client.release();
  }
});

router.delete('/:slotId', [
  param('slotId').isUUID().custom(async (value) => {
    const slot = await pool.query(
      'SELECT is_booked, start_time, consultant_id FROM time_slots WHERE id = $1',
      [value]
    );
    if (!slot.rows.length) throw new Error('Time slot not found');
    if (slot.rows[0].is_booked) throw new Error('Cannot delete booked time slots');
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

    const slotCheck = await client.query(
      `SELECT recurring_pattern_id FROM time_slots WHERE id = $1`,
      [req.params.slotId]
    );

    if (!slotCheck.rows.length) {
      throw new Error('Time slot not found');
    }

    if (slotCheck.rows[0].recurring_pattern_id) {
      await client.query(
        `DELETE FROM time_slots
         WHERE recurring_pattern_id = $1
           AND start_time >= NOW()
           AND is_booked = FALSE`,
        [slotCheck.rows[0].recurring_pattern_id]
      );
    } else {
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
      details: err.message
    });
  } finally {
    client.release();
  }
});

module.exports = router;