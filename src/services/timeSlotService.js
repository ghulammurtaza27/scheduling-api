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
   * Validates and creates time slots with DST awareness
   */
  async createTimeSlot(consultant_id, start_time, end_time, recurring = null, timezone = 'UTC') {
    return withTransaction(async (client) => {
      const { startUTC, endUTC, warnings } = this.#validateAndConvertTime(
        start_time, 
        end_time, 
        timezone
      );

      if (recurring) {
        const slots = this.#generateRecurringSlots(
          startUTC,
          endUTC,
          recurring,
          timezone
        );
        
        // Create all recurring slots and collect results
        const createdSlots = await Promise.all(
          slots.map(slot => this.#createSingleSlot(
            client, 
            consultant_id, 
            slot.start, 
            slot.end
          ))
        );

        return {
          success: true,
          message: 'Recurring slots created',
          data: createdSlots,
          warnings
        };
      }

      // Create single slot
      await this.#checkOverlap(client, consultant_id, startUTC, endUTC);
      const slot = await this.#createSingleSlot(client, consultant_id, startUTC, endUTC);

      return { 
        data: slot,
        warnings 
      };
    });
  }

  /**
   * Validates time range and converts to UTC
   */
  #validateAndConvertTime(start_time, end_time, timezone) {
    const start = moment.tz(start_time, timezone);
    const end = moment.tz(end_time, timezone);
    const now = moment.tz(timezone);
    const warnings = [];

    // Basic validation
    if (!start.isValid() || !end.isValid()) {
      throw new AppError('Invalid date/time format', 400);
    }

    if (!end.isAfter(start)) {
      throw new AppError('End time must be after start time', 400);
    }

    if (start.isBefore(now)) {
      throw new AppError('Cannot create slots in the past', 400);
    }

    // Check DST transition
    if (start.isDST() !== end.isDST()) {
      warnings.push('Time slot spans DST transition');
    }

    // Validate duration
    const durationMinutes = end.diff(start, 'minutes');
    if (durationMinutes < TIME_SLOTS.MIN_DURATION_MINUTES || 
        durationMinutes > TIME_SLOTS.MAX_DURATION_MINUTES) {
      throw new AppError('Invalid slot duration', 400);
    }

    // Convert to UTC for storage
    return {
      startUTC: start.utc().toDate(),
      endUTC: end.utc().toDate(),
      warnings
    };
  }

  /**
   * Generates recurring slot dates
   */
  #generateRecurringSlots(startDate, endDate, recurring, timezone) {
    const slots = [];
    const duration = moment(endDate).diff(moment(startDate));
    let current = moment(startDate);
    const until = moment.tz(recurring.until, timezone);

    while (current.isSameOrBefore(until)) {
      slots.push({
        start: current.utc().toDate(),
        end: moment(current).add(duration, 'milliseconds').utc().toDate()
      });

      // Add interval based on frequency
      if (recurring.frequency === 'weekly') {
        current.add(1, 'week');
      } else if (recurring.frequency === 'monthly') {
        current.add(1, 'month');
      }
    }

    return slots;
  }

  /**
   * Creates a single slot in the database
   */
  async #createSingleSlot(client, consultant_id, start, end) {
    const { rows: [slot] } = await client.query(
      `INSERT INTO time_slots (consultant_id, start_time, end_time)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [consultant_id, start, end]
    );
    return slot;
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

  /**
   * Checks for overlapping time slots
   * @private
   */
  async #checkOverlap(client, consultant_id, startTime, endTime) {
    const { rows } = await client.query(
      `SELECT id FROM time_slots 
       WHERE consultant_id = $1 
       AND NOT is_booked
       AND tsrange(start_time, end_time) && tsrange($2::timestamp, $3::timestamp)`,
      [consultant_id, startTime, endTime]
    );

    if (rows.length > 0) {
      throw new AppError('Time slot overlaps with existing slot', 400);
    }
  }
}

module.exports = new TimeSlotService(); 