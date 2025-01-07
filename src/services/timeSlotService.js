const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { PAGINATION, TIME_SLOTS } = require('../config/constants');

class TimeSlotService {
  #validateTimeRange(start_time, end_time, isRecurring = false) {
    let start, end;

    // Handle time-only format for recurring slots
    if (isRecurring && start_time.includes(':') && !start_time.includes('T')) {
      start = new Date();
      end = new Date();
      
      const [startHour, startMinute] = start_time.split(':').map(Number);
      const [endHour, endMinute] = end_time.split(':').map(Number);
      
      start.setUTCHours(startHour, startMinute, 0, 0);
      end.setUTCHours(endHour, endMinute, 0, 0);
      
      // If end time is before start time, move end to next day
      if (end <= start) {
        end.setDate(end.getDate() + 1);
      }

      // For recurring slots, we only validate the time part, not the date
      const now = new Date();
      const currentTime = now.getUTCHours() * 60 + now.getUTCMinutes();
      const startTime = startHour * 60 + startMinute;

      if (startTime < currentTime && start.getDate() === now.getDate()) {
        start.setDate(start.getDate() + 1);
        end.setDate(end.getDate() + 1);
      }
    } else {
      start = new Date(start_time);
      end = new Date(end_time);
    }
    
    if (start >= end) {
      throw new AppError('End time must be after start time', 400);
    }

    // Skip past time validation for recurring slots
    if (!isRecurring && start < new Date()) {
      throw new AppError('Cannot create slots in the past', 400);
    }

    const durationMinutes = (end - start) / (1000 * 60);
    if (durationMinutes < TIME_SLOTS.MIN_DURATION_MINUTES) {
      throw new AppError(`Slot duration cannot be shorter than minimum duration (${TIME_SLOTS.MIN_DURATION_MINUTES} minutes)`, 400);
    }
    
    if (durationMinutes > TIME_SLOTS.MAX_DURATION_MINUTES) {
      throw new AppError(`Slot duration cannot exceed maximum duration (${TIME_SLOTS.MAX_DURATION_MINUTES} minutes)`, 400);
    }

    return { start, end };
  }

  async getTimeSlots({ consultant_id, date, month, page = 1, limit = PAGINATION.DEFAULT_LIMIT, include_booked = false }) {
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

      // Only show available slots by default
      if (!include_booked) {
        baseQuery += ` AND ts.is_booked = false`;
      }

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
      
      // Pass isRecurring flag to validateTimeRange
      const { start, end } = this.#validateTimeRange(start_time, end_time, !!recurring);

      // Check for overlapping slots with more precise detection
      const overlapCheck = await client.query(
        `SELECT id FROM time_slots 
         WHERE consultant_id = $1 
         AND NOT is_booked
         AND tsrange(start_time, end_time) && tsrange($2::timestamp, $3::timestamp)
         AND NOT (start_time = $3::timestamp OR end_time = $2::timestamp)`,
        [consultant_id, start.toISOString(), end.toISOString()]
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
          [consultant_id, start.toISOString(), end.toISOString(), pattern_id]
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
          [consultant_id, start.toISOString(), end.toISOString()]
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
      throw err;
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