const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { PAGINATION } = require('../config/constants');
const { withTransaction } = require('../utils/dbTransaction');
const moment = require('moment-timezone');

/**
 * Service class handling all time slot related operations
 * Manages creation, retrieval, updates, and deletion of consultation time slots
 */
class TimeSlotService {
  // CRUD Operations
  /**
   * Retrieves a single time slot by ID
   * @param {string} slotId - UUID of the time slot
   * @throws {AppError} If slot ID format is invalid
   * @returns {Promise<Object>} Time slot data
   */
  async getSlotById(slotId) {
    try {
      const { rows: [slot] } = await pool.query(
        'SELECT * FROM time_slots WHERE id = $1',
        [slotId]
      );
      return slot;
    } catch (err) {
      if (err.code === '22P02') throw new AppError('Invalid slot ID format', 400);
      throw err;
    }
  }

  /**
   * Creates a new time slot or recurring time slots
   * @param {string} consultant_id - UUID of the consultant
   * @param {string} start_time - Start time of the slot
   * @param {string} end_time - End time of the slot
   * @param {Object} [recurring=null] - Recurring pattern (null for single slot)
   * @param {string} [timezone='UTC'] - Timezone for the slot
   * @returns {Promise<Object>} Created slot(s) data with warnings
   */
  async createTimeSlot(consultant_id, start_time, end_time, recurring = null, timezone = 'UTC') {
    return withTransaction(async (client) => {
      const { startUTC, endUTC, warnings } = this.#convertTimeToUTC(start_time, end_time, timezone);

      if (!recurring) {
        await this.#checkOverlap(client, consultant_id, startUTC, endUTC);
        const slot = await this.#createSingleSlot(client, consultant_id, startUTC, endUTC);
        return { data: slot, warnings };
      }

      const slots = this.#generateRecurringSlots(startUTC, endUTC, recurring, timezone);
      
      // Check overlap for each recurring slot
      await Promise.all(
        slots.map(slot => this.#checkOverlap(client, consultant_id, slot.start, slot.end))
      );

      const createdSlots = await Promise.all(
        slots.map(slot => this.#createSingleSlot(client, consultant_id, slot.start, slot.end))
      );

      return { success: true, message: 'Recurring slots created', data: createdSlots, warnings };
    });
  }

  /**
   * Deletes a time slot if it's not booked
   * @param {string} slotId - UUID of the slot to delete
   * @throws {AppError} If slot is booked or not found
   * @returns {Promise<Object>} Deletion confirmation
   */
  async deleteTimeSlot(slotId) {
    return withTransaction(async (client) => {
      const slot = await this.getSlotById(slotId);
      if (!slot) throw new AppError('Time slot not found', 400);
      if (slot.is_booked) throw new AppError('Cannot delete booked time slots', 400);

      await client.query(
        'DELETE FROM time_slots WHERE id = $1 AND NOT is_booked',
        [slotId]
      );

      return { message: 'Time slot deleted successfully' };
    });
  }

  // Reservation Operations
  /**
   * Reserves a time slot for a customer
   * @param {string} slotId - UUID of the slot
   * @param {string} customerId - UUID of the customer
   * @throws {AppError} If slot is unavailable or not found
   * @returns {Promise<Object>} Updated slot data
   */
  async reserveTimeSlot(slotId, customerId) {
    return withTransaction(async (client) => {
      const { rows: [slot] } = await client.query(
        'SELECT * FROM time_slots WHERE id = $1 FOR UPDATE',
        [slotId]
      );

      if (!slot) throw new AppError('Time slot not found', 400);
      if (slot.is_booked) throw new AppError('Time slot is not available', 400);

      const { rows: [updatedSlot] } = await client.query(
        `UPDATE time_slots 
         SET is_booked = true, customer_id = $1, updated_at = NOW()
         WHERE id = $2 AND NOT is_booked
         RETURNING *`,
        [customerId, slotId]
      );

      if (!updatedSlot) throw new AppError('Time slot is not available', 400);
      return { data: updatedSlot };
    });
  }

  // Query Operations
  /**
   * Retrieves time slots with filtering and pagination
   * @param {Object} query - Query parameters
   * @param {string} [query.consultant_id] - Filter by consultant
   * @param {string} [query.start_date] - Filter by start date
   * @param {string} [query.end_date] - Filter by end date
   * @param {string} [query.month] - Filter by month (YYYY-MM)
   * @param {number} [query.page=1] - Page number
   * @param {number} [query.limit] - Results per page
   * @returns {Promise<Object>} Paginated time slots
   */
  async getTimeSlots(query) {
    const { consultant_id, start_date, end_date, month, page = 1, limit = PAGINATION.DEFAULT_LIMIT } = query;
    const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
    const offset = (Math.max(1, parseInt(page)) - 1) * limitNum;
    
    const queryParams = [];
    let paramCount = 1;
    let baseQuery = `
      SELECT ts.*, 
             c.name as consultant_name,
             cu.name as customer_name
      FROM time_slots ts
      LEFT JOIN consultants c ON ts.consultant_id = c.id
      LEFT JOIN customers cu ON ts.customer_id = cu.id
      WHERE 1=1
    `;

    if (consultant_id) {
      baseQuery += ` AND ts.consultant_id = $${paramCount++}`;
      queryParams.push(consultant_id);
    }

    if (start_date) {
      baseQuery += ` AND DATE(ts.start_time) >= $${paramCount++}`;
      queryParams.push(start_date);
    }

    if (end_date) {
      baseQuery += ` AND DATE(ts.start_time) <= $${paramCount++}`;
      queryParams.push(end_date);
    }

    if (month) {
      baseQuery += ` AND TO_CHAR(ts.start_time, 'YYYY-MM') = $${paramCount++}`;
      queryParams.push(month);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM (${baseQuery}) AS count_query`,
      queryParams
    );

    const result = await pool.query(
      `${baseQuery} ORDER BY ts.start_time LIMIT ${limitNum} OFFSET ${offset}`,
      queryParams
    );

    return {
      data: {
        time_slots: result.rows,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(parseInt(countResult.rows[0].count) / limitNum),
          total_items: parseInt(countResult.rows[0].count),
          limit: limitNum
        }
      }
    };
  }

  // Helper Methods
  async checkCustomerExists(customerId) {
    try {
      const { rows: [customer] } = await pool.query(
        'SELECT id FROM customers WHERE id = $1',
        [customerId]
      );
      return !!customer;
    } catch (err) {
      if (err.code === '22P02') throw new AppError('Invalid customer ID format', 400);
      throw err;
    }
  }

  // Private Helper Methods
  /**
   * Converts local time to UTC and checks for DST transitions
   * @private
   */
  #convertTimeToUTC(start_time, end_time, timezone = 'UTC') {
    const start = moment.tz(start_time, timezone);
    const end = moment.tz(end_time, timezone);
    const warnings = [];

    if (start.isDST() !== end.isDST()) {
      warnings.push('Time slot spans DST transition');
    }

    return { startUTC: start.utc().toDate(), endUTC: end.utc().toDate(), warnings };
  }

  /**
   * Creates a single time slot in the database
   * @private
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
   * Checks for overlapping time slots
   * @private
   * @throws {AppError} If overlap is found
   */
  async #checkOverlap(client, consultant_id, startTime, endTime) {
    const { rows } = await client.query(
      `SELECT id FROM time_slots 
       WHERE consultant_id = $1 
       AND NOT is_booked
       AND tsrange(start_time, end_time) && tsrange($2::timestamp, $3::timestamp)`,
      [consultant_id, startTime, endTime]
    );

    if (rows.length > 0) throw new AppError('Time slot overlaps with existing slot', 400);
  }

  /**
   * Generates recurring time slots based on pattern
   * @private
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

      current.add(1, recurring.frequency === 'weekly' ? 'week' : 'month');
    }

    return slots;
  }
}

module.exports = new TimeSlotService(); 