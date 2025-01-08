const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { PAGINATION, TIME_SLOTS } = require('../config/constants');
const { withTransaction } = require('../utils/dbTransaction');
const moment = require('moment-timezone');

/**
 * Service class for managing time slots
 * Handles creation, retrieval, reservation, and deletion of time slots
 */
class TimeSlotService {
  /**
   * Validates if a given date is valid
   * @param {number} year - Full year (e.g., 2024)
   * @param {number} month - Month (0-11)
   * @param {number} day - Day of month (1-31)
   * @returns {boolean} True if date is valid
   * @private
   */
  #isValidDate(year, month, day) {
    const date = new Date(Date.UTC(year, month, day));
    return date.getUTCFullYear() === year &&
           date.getUTCMonth() === month &&
           date.getUTCDate() === day;
  }

  /**
   * Creates a UTC date from hours and minutes
   * @param {string} dateTimeStr - ISO date string or time string
   * @param {string} timezone - Timezone (defaults to UTC)
   * @returns {Date} UTC date object
   * @throws {AppError} If date is invalid
   * @private
   */
  #createUTCDate(dateTimeStr, timezone = 'UTC') {
    // If it's already an ISO string, just parse it
    if (dateTimeStr.includes('T')) {
      const date = moment.tz(dateTimeStr, timezone);
      if (!date.isValid()) {
        throw new AppError('Invalid date format', 400);
      }
      return date.toDate();
    }

    // If it's just time (HH:mm), use current date
    const [hours, minutes] = dateTimeStr.split(':').map(Number);
    const date = moment.tz(timezone);
    date.hours(hours);
    date.minutes(minutes);
    date.seconds(0);
    date.milliseconds(0);

    return date.toDate();
  }

  /**
   * Handles recurring date patterns
   * @param {Date} now - Current date
   * @param {Object} recurring - Recurring pattern object
   * @param {string} recurring.frequency - 'weekly' or 'monthly'
   * @param {number} [recurring.day_of_week] - Day of week (0-6)
   * @param {number} [recurring.day_of_month] - Day of month (1-31)
   * @returns {Date} Next occurrence date
   * @throws {AppError} If pattern is invalid
   * @private
   */
  #handleRecurringDate(now, recurring) {
    if (recurring.frequency === 'weekly' && 'day_of_week' in recurring) {
      const daysToAdd = (recurring.day_of_week - now.getUTCDay() + 7) % 7;
      const date = new Date(now);
      date.setUTCDate(date.getUTCDate() + daysToAdd);
      return date;
    }
    
    if (recurring.frequency === 'monthly' && 'day_of_month' in recurring) {
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      const day = recurring.day_of_month;

      if (!this.#isValidDate(year, month, day)) {
        throw new AppError(`Invalid day of month: ${day}`, 400);
      }

      const date = new Date(Date.UTC(year, month, day));
      
      if (date < now) {
        if (!this.#isValidDate(year, month + 1, day)) {
          throw new AppError(`Invalid day for next month: ${day}`, 400);
        }
        date.setUTCMonth(date.getUTCMonth() + 1);
      }
      return date;
    }
    
    throw new AppError('Invalid recurring pattern', 400);
  }

  /**
   * Validates time range for a slot
   * @param {string} start_time - Start time (ISO or HH:mm format)
   * @param {string} end_time - End time (ISO or HH:mm format)
   * @param {Object} [recurring] - Recurring pattern
   * @param {string} [timezone] - Timezone (defaults to UTC)
   * @returns {Object} Validated start and end dates
   * @throws {AppError} If validation fails
   * @private
   */
  #validateTimeRange(start_time, end_time, recurring = null, timezone = 'UTC') {
    const now = moment.tz(timezone);
    let start, end;

    try {
      start = this.#createUTCDate(start_time, timezone);
      end = this.#createUTCDate(end_time, timezone);
    } catch (err) {
      throw new AppError('Invalid date/time format', 400);
    }

    // Validate time range
    if (start >= end) {
      throw new AppError('End time must be after start time', 400);
    }

    // Check if slot is in the past
    if (!recurring && moment(start).isBefore(now)) {
      throw new AppError('Cannot create slots in the past', 400);
    }

    // Validate duration
    const durationMinutes = moment(end).diff(moment(start), 'minutes');
    if (durationMinutes < TIME_SLOTS.MIN_DURATION_MINUTES) {
      throw new AppError(
        `Slot duration cannot be shorter than ${TIME_SLOTS.MIN_DURATION_MINUTES} minutes`,
        400
      );
    }
    
    if (durationMinutes > TIME_SLOTS.MAX_DURATION_MINUTES) {
      throw new AppError(
        `Slot duration cannot exceed ${TIME_SLOTS.MAX_DURATION_MINUTES} minutes`,
        400
      );
    }

    return { start, end };
  }

  /**
   * Retrieves a time slot by ID
   * @param {string} slotId - UUID of the slot
   * @returns {Promise<Object>} Time slot object
   * @throws {AppError} If ID format is invalid
   */
  async getSlotById(slotId) {
    try {
      const { rows: [slot] } = await pool.query(
        'SELECT * FROM time_slots WHERE id = $1',
        [slotId]
      );
      return slot;
    } catch (err) {
      if (err.code === '22P02') {
        throw new AppError('Invalid slot ID format', 400);
      }
      throw err;
    }
  }

  /**
   * Checks if a customer exists
   * @param {string} customerId - UUID of the customer
   * @returns {Promise<boolean>} True if customer exists
   * @throws {AppError} If ID format is invalid
   */
  async checkCustomerExists(customerId) {
    try {
      const { rows: [customer] } = await pool.query(
        'SELECT id FROM customers WHERE id = $1',
        [customerId]
      );
      return !!customer;
    } catch (err) {
      if (err.code === '22P02') {
        throw new AppError('Invalid customer ID format', 400);
      }
      throw err;
    }
  }

  /**
   * Creates a new time slot
   * @param {string} consultant_id - UUID of the consultant
   * @param {string} start_time - Start time
   * @param {string} end_time - End time
   * @param {Object} [recurring] - Recurring pattern
   * @returns {Promise<Object>} Created time slot
   * @throws {AppError} If validation fails or slot overlaps
   */
  async createTimeSlot(consultant_id, start_time, end_time, recurring = null) {
    return withTransaction(async (client) => {
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

        return { data: slot };
      }

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

      return { data: slot };
    });
  }

  /**
   * Retrieves time slots based on query parameters
   * @param {Object} query - Query parameters
   * @param {string} [query.consultant_id] - Filter by consultant
   * @param {string} [query.date] - Filter by date
   * @param {string} [query.month] - Filter by month (YYYY-MM)
   * @param {number} [query.page=1] - Page number
   * @param {number} [query.limit] - Items per page
   * @param {boolean} [query.include_booked=false] - Include booked slots
   * @returns {Promise<Object>} Paginated time slots
   */
  async getTimeSlots(query) {
    const { consultant_id, start_date, end_date, date, month, page = 1, include_booked = false, timezone = 'UTC' } = query;
    
    // Convert date filters to UTC
    if (start_date) {
      query.start_date = moment.tz(start_date, timezone).startOf('day').toISOString();
    }
    if (end_date) {
      query.end_date = moment.tz(end_date, timezone).endOf('day').toISOString();
    }

    // Enforce maximum page size
    let limit = parseInt(query.limit) || PAGINATION.DEFAULT_LIMIT;
    limit = Math.min(limit, PAGINATION.MAX_LIMIT);
    
    try {
      const queryParams = [];
      let paramCount = 1;
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

      if (!include_booked) {
        baseQuery += ` AND ts.is_booked = false`;
      }

      if (consultant_id) {
        baseQuery += ` AND ts.consultant_id = $${paramCount}`;
        queryParams.push(consultant_id);
        paramCount++;
      }

      // Add date range filtering
      if (start_date) {
        baseQuery += ` AND DATE(ts.start_time) >= DATE($${paramCount})`;
        queryParams.push(query.start_date);
        paramCount++;
      }

      if (end_date) {
        baseQuery += ` AND DATE(ts.start_time) <= DATE($${paramCount})`;
        queryParams.push(query.end_date);
        paramCount++;
      }

      // Keep existing date and month filters if needed
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

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM (${baseQuery}) AS count_query`,
        queryParams
      );

      const totalItems = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(totalItems / limit);
      const offset = ((parseInt(page) || 1) - 1) * limit;

      const finalQuery = `${baseQuery} 
        ORDER BY ts.start_time 
        LIMIT ${limit} OFFSET ${offset}`;

      const result = await pool.query(finalQuery, queryParams);

      return {
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

  /**
   * Reserves a time slot
   * @param {string} slotId - UUID of the slot
   * @param {string} customerId - UUID of the customer
   * @returns {Promise<Object>} Reserved time slot
   * @throws {AppError} If slot is unavailable or not found
   */
  async reserveTimeSlot(slotId, customerId) {
    return withTransaction(async (client) => {
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

  /**
   * Deletes a time slot
   * @param {string} slotId - UUID of the slot
   * @returns {Promise<Object>} Success message
   * @throws {AppError} If slot is booked or not found
   */
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
}

module.exports = new TimeSlotService(); 