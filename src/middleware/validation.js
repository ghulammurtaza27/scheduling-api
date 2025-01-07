const { body, query, param } = require('express-validator');
const pool = require('../config/database');

const validateTimeFormat = {
  recurring: (value) => {
    return value.match(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/);
  },
  single: (value) => {
    return value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
  }
};

exports.timeSlotCreate = [
  body('consultant_id').isUUID().notEmpty(),
  body('start_time').custom((value, { req }) => {
    const isValid = req.body.recurring 
      ? validateTimeFormat.recurring(value)
      : validateTimeFormat.single(value);
    if (!isValid) {
      throw new Error(`Invalid time format for ${req.body.recurring ? 'recurring' : 'single'} slot`);
    }
    return true;
  }),
  body('end_time').custom((value, { req }) => {
    const isValid = req.body.recurring 
      ? validateTimeFormat.recurring(value)
      : validateTimeFormat.single(value);
    if (!isValid) {
      throw new Error(`Invalid time format for ${req.body.recurring ? 'recurring' : 'single'} slot`);
    }
    if (!req.body.recurring && new Date(value) <= new Date(req.body.start_time)) {
      throw new Error('End time must be after start time');
    }
    return true;
  }),
  body('recurring.frequency').optional().isIn(['weekly', 'monthly']),
  body('recurring.day_of_week').optional().isInt({ min: 0, max: 6 })
    .custom((value, { req }) => {
      if (req.body.recurring?.frequency === 'weekly' && value === undefined) {
        throw new Error('day_of_week is required for weekly recurring slots');
      }
      return true;
    }),
  body('recurring.until').optional().isISO8601()
];

exports.timeSlotQuery = [
  query('consultant_id').optional().isUUID(),
  query('date').optional().isDate(),
  query('month').optional().matches(/^\d{4}-(0[1-9]|1[0-2])$/),
  query('start_date').optional().isDate()
    .custom((value, { req }) => {
      if (value && req.query.end_date && value > req.query.end_date) {
        throw new Error('Start date must be before end date');
      }
      return true;
    }),
  query('end_date').optional().isDate(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
];

exports.slotReservation = [
  param('slotId')
    .isUUID()
    .custom(async (value) => {
      const slot = await pool.query(
        'SELECT is_booked FROM time_slots WHERE id = $1',
        [value]
      );
      if (!slot.rows.length) throw new Error('Time slot not found');
      if (slot.rows[0].is_booked) throw new Error('Time slot is not available');
      return true;
    }),
  body('customer_id').isUUID().notEmpty(),
  body('customer_id').custom(async (value) => {
    const customer = await pool.query(
      'SELECT id FROM customers WHERE id = $1',
      [value]
    );
    if (!customer.rows.length) throw new Error('Customer not found');
    return true;
  })
];