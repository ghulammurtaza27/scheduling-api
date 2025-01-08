const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { PAGINATION, TIME_SLOTS } = require('../config/constants');
const { withTransaction } = require('../utils/dbTransaction');

class TimeSlotService {
  #isValidDate(year, month, day) {
    const date = new Date(Date.UTC(year, month, day));
    return date.getUTCFullYear() === year &&
           date.getUTCMonth() === month &&
           date.getUTCDate() === day;
  }

  #createUTCDate(hours, minutes, baseDate) {
    const year = baseDate.getUTCFullYear();
    const month = baseDate.getUTCMonth();
    const day = baseDate.getUTCDate();

    if (!this.#isValidDate(year, month, day)) {
      throw new AppError('Invalid date', 400);
    }

    return new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
  }

  #handleRecurringDate(now, recurring) {
    if (recurring.frequency === 'weekly' && 'day_of_week' in recurring) {
      const daysToAdd = (recurring.day_of_week - now.getUTCDay() + 7) % 7;
      const date = new Date(now);
      date.setUTCDate(date.getUTCDate() + daysToAdd);
      return date;
    }
    
    if (recurring.frequency === 'monthly' && 'day_of_month' in recurring) {
      // Validate day_of_month is real for the target month
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      const day = recurring.day_of_month;

      if (!this.#isValidDate(year, month, day)) {
        throw new AppError(`Invalid day of month: ${day}`, 400);
      }

      const date = new Date(Date.UTC(year, month, day));
      
      if (date < now) {
        // Check next month's date is valid too
        if (!this.#isValidDate(year, month + 1, day)) {
          throw new AppError(`Invalid day for next month: ${day}`, 400);
        }
        date.setUTCMonth(date.getUTCMonth() + 1);
      }
      return date;
    }
    
    throw new AppError('Invalid recurring pattern', 400);
  }

  #validateTimeRange(start_time, end_time, recurring = null) {
    const now = new Date();
    let start, end;

    // Handle HH:MM format
    if (start_time.includes(':') && !start_time.includes('T')) {
      const [startHours, startMinutes] = start_time.split(':').map(Number);
      const [endHours, endMinutes] = end_time.split(':').map(Number);

      const baseDate = recurring ? 
        this.#handleRecurringDate(now, recurring) : 
        now;

      start = this.#createUTCDate(startHours, startMinutes, baseDate);
      end = this.#createUTCDate(endHours, endMinutes, baseDate);

      if (recurring?.until && new Date(recurring.until) <= now) {
        throw new AppError('Until date must be in the future', 400);
      }

      if (end < start) {
        end.setUTCDate(end.getUTCDate() + 1);
      }

      if (start < now) {
        const shift = recurring?.frequency === 'weekly' ? 7 : 1;
        const method = recurring?.frequency === 'weekly' ? 'setUTCDate' : 'setUTCMonth';
        const amount = recurring?.frequency === 'weekly' ? 
          start.getUTCDate() + shift : 
          start.getUTCMonth() + shift;

        if (recurring) {
          start[method](amount);
          end[method](amount);
        } else {
          throw new AppError('Cannot create slots in the past', 400);
        }
      }
    } else {
      // Handle ISO format with validation
      const startDate = new Date(start_time);
      const endDate = new Date(end_time);

      // Validate the dates are real
      if (!this.#isValidDate(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate()
      )) {
        throw new AppError('Invalid start date', 400);
      }

      if (!this.#isValidDate(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth(),
        endDate.getUTCDate()
      )) {
        throw new AppError('Invalid end date', 400);
      }

      start = startDate;
      end = endDate;
    }

    // Validate time constraints
    if (start >= end) {
      throw new AppError('End time must be after start time', 400);
    }

    if (!recurring && start < now) {
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

  async createTimeSlot(consultant_id, start_time, end_time, recurring = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const { start, end } = this.#validateTimeRange(start_time, end_time, recurring);
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      if (recurring) {
        const { rows: [pattern] } = await client.query(
          `INSERT INTO recurring_patterns (frequency, day_of_week, day_of_month, until_date)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [recurring.frequency, recurring.day_of_week, recurring.day_of_month, recurring.until]
        );

        const { rows: [slot] } = await client.query(
          `INSERT INTO time_slots (consultant_id, start_time, end_time, recurring_pattern_id)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [consultant_id, startIso, endIso, pattern.id]
        );

        await client.query('COMMIT');
        return { status: 'success', statusCode: 201, data: slot };
      }

      // Check for overlapping slots
      const { rows: overlaps } = await client.query(
        `SELECT id FROM time_slots 
         WHERE consultant_id = $1 
         AND NOT is_booked
         AND tsrange(start_time, end_time) && tsrange($2::timestamp, $3::timestamp)
         AND NOT (start_time = $3::timestamp OR end_time = $2::timestamp)`,
        [consultant_id, startIso, endIso]
      );

      if (overlaps.length > 0) {
        throw new AppError('Time slot overlaps with existing slot', 400);
      }

      const { rows: [slot] } = await client.query(
        `INSERT INTO time_slots (consultant_id, start_time, end_time)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [consultant_id, startIso, endIso]
      );

      await client.query('COMMIT');
      return { status: 'success', statusCode: 201, data: slot };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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

  async reserveTimeSlot(slotId, customerId) {
    return withTransaction(async (client) => {
      // Get slot with lock
      const { rows: [slot] } = await client.query(
        'SELECT * FROM time_slots WHERE id = $1 FOR UPDATE',
        [slotId]
      );

      if (!slot) {
        throw new AppError('Time slot not found', 400);
      }

      if (slot.is_booked) {
        throw new AppError('Time slot is not available', 400);
      }

      const { rows: [updatedSlot] } = await client.query(
        `UPDATE time_slots 
         SET is_booked = true, customer_id = $1, updated_at = NOW()
         WHERE id = $2 AND NOT is_booked
         RETURNING *`,
        [customerId, slotId]
      );

      if (!updatedSlot) {
        throw new AppError('Time slot is not available', 400);
      }

      return { data: updatedSlot };
    });
  }

  async deleteTimeSlot(slotId) {
    return withTransaction(async (client) => {
      const { rows: [slot] } = await client.query(
        'SELECT * FROM time_slots WHERE id = $1',
        [slotId]
      );

      if (!slot) {
        throw new AppError('Time slot not found', 400);
      }

      if (slot.is_booked) {
        throw new AppError('Cannot delete booked time slots', 400);
      }

      await client.query(
        'DELETE FROM time_slots WHERE id = $1 AND NOT is_booked',
        [slotId]
      );

      return { message: 'Time slot deleted successfully' };
    });
  }

  async getSlotById(slotId) {
    try {
      const { rows: [slot] } = await pool.query(
        'SELECT * FROM time_slots WHERE id = $1',
        [slotId]
      );
      return slot;
    } catch (err) {
      if (err.code === '22P02') { // Invalid UUID format
        throw new AppError('Invalid slot ID format', 400);
      }
      throw err;
    }
  }

  async checkCustomerExists(customerId) {
    try {
      const { rows: [customer] } = await pool.query(
        'SELECT id FROM customers WHERE id = $1',
        [customerId]
      );
      return !!customer;
    } catch (err) {
      if (err.code === '22P02') { // Invalid UUID format
        throw new AppError('Invalid customer ID format', 400);
      }
      throw err;
    }
  }
}

module.exports = new TimeSlotService(); 