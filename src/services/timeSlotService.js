const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { PAGINATION, TIME_SLOTS } = require('../config/constants');

class TimeSlotService {
  #validateTimeRange(start_time, end_time) {
    const start = new Date(start_time);
    const end = new Date(end_time);
    
    if (start >= end) {
      throw new AppError('End time must be after start time', 400);
    }

    if (start < new Date()) {
      throw new AppError('Cannot create slots in the past', 400);
    }

    const durationMinutes = (end - start) / (1000 * 60);
    if (durationMinutes < TIME_SLOTS.MIN_DURATION_MINUTES) {
      throw new AppError('minimum duration must be at least 30 minutes', 400);
    }
  }

  async getTimeSlots({ consultant_id, date, month, page = 1, limit = PAGINATION.DEFAULT_LIMIT }) {
    try {
      // Ensure limit doesn't exceed maximum
      limit = Math.min(parseInt(limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
      const offset = ((parseInt(page) || 1) - 1) * limit;

      let baseQuery = `
        SELECT ts.*, 
               COALESCE(c.name, 'Unknown') as consultant_name,
               rp.frequency,
               rp.day_of_week,
               rp.day_of_month
        FROM time_slots ts
        LEFT JOIN consultants c ON ts.consultant_id = c.id
        LEFT JOIN recurring_patterns rp ON ts.recurring_pattern_id = rp.id
        WHERE ts.start_time >= NOW()
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
        queryParams.push(year, parseInt(monthNum));
        paramCount += 2;
      }

      // Get total count
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM (${baseQuery}) AS count_query`,
        queryParams
      );

      const totalItems = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(totalItems / limit);

      // Get paginated results
      const finalQuery = `${baseQuery} 
        ORDER BY ts.start_time 
        LIMIT ${limit} OFFSET ${offset}`;

      const result = await pool.query(finalQuery, queryParams);

      return {
        status: 'success',
        statusCode: 200,
        data: {
          time_slots: result.rows,
          pagination: {
            current_page: parseInt(page) || 1,
            total_pages: totalPages,
            total_items: totalItems,
            limit: limit
          }
        }
      };
    } catch (err) {
      throw err;
    }
  }

  async createTimeSlot(consultant_id, start_time, end_time, recurring = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Validate time range before any DB operations
      this.#validateTimeRange(start_time, end_time);

      // Check for overlapping slots
      const overlapCheck = await client.query(
        `SELECT id FROM time_slots 
         WHERE consultant_id = $1 
         AND NOT is_booked
         AND ((start_time, end_time) OVERLAPS ($2::timestamp, $3::timestamp))`,
        [consultant_id, start_time, end_time]
      );

      if (overlapCheck.rows.length > 0) {
        throw new AppError('Time slot overlaps with existing slot', 400);
      }

      if (recurring) {
        const untilDate = new Date(recurring.until);
        if (untilDate <= new Date()) {
          throw new AppError('Recurring until date must be in the future', 400);
        }

        // Create recurring pattern
        const patternResult = await client.query(
          `INSERT INTO recurring_patterns 
           (frequency, day_of_week, day_of_month, until_date)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [recurring.frequency, recurring.day_of_week, recurring.day_of_month, recurring.until]
        );

        const pattern_id = patternResult.rows[0].id;

        // Create the time slot with recurring pattern
        const result = await client.query(
          `INSERT INTO time_slots 
           (consultant_id, start_time, end_time, recurring_pattern_id)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [consultant_id, start_time, end_time, pattern_id]
        );

        await client.query('COMMIT');
        return {
          status: 'success',
          statusCode: 201,
          data: result.rows[0]
        };
      } else {
        const result = await client.query(
          `INSERT INTO time_slots 
           (consultant_id, start_time, end_time)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [consultant_id, start_time, end_time]
        );

        await client.query('COMMIT');
        return {
          status: 'success',
          statusCode: 201,
          data: result.rows[0]
        };
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err; // Let the route handler handle the error
    } finally {
      client.release();
    }
  }

  async reserveTimeSlot(slotId, customerId) {
    if (!slotId || !customerId) {
      throw new AppError('Slot ID and Customer ID are required', 400);
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if customer exists first
      const customerCheck = await client.query(
        'SELECT id FROM customers WHERE id = $1',
        [customerId]
      );

      if (!customerCheck?.rows?.length) {
        throw new AppError('Customer not found', 404);
      }

      // Check if slot exists and is available
      const slotCheck = await client.query(
        'SELECT * FROM time_slots WHERE id = $1',
        [slotId]
      );

      if (!slotCheck?.rows?.length) {
        throw new AppError('Time slot not found', 404);
      }

      if (slotCheck.rows[0].is_booked) {
        throw new AppError('Time slot is already booked', 400);
      }

      // Update the slot
      const result = await client.query(
        `UPDATE time_slots 
         SET is_booked = true, 
             customer_id = $1,
             updated_at = NOW()
         WHERE id = $2 AND NOT is_booked
         RETURNING *`,
        [customerId, slotId]
      );

      if (!result?.rows?.[0]) {
        throw new AppError('Failed to reserve time slot', 500);
      }

      await client.query('COMMIT');
      return {
        status: 'success',
        statusCode: 200,
        data: result.rows[0]
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteTimeSlot(slotId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const slotCheck = await client.query(
        `SELECT recurring_pattern_id FROM time_slots WHERE id = $1`,
        [slotId]
      );

      if (!slotCheck.rows.length) {
        throw new AppError('Time slot not found', 404);
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
          [slotId]
        );
      }

      await client.query('COMMIT');
      return {
        statusCode: 200,
        message: 'Time slot(s) deleted successfully'
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new TimeSlotService(); 