const { body, query, param, validationResult } = require('express-validator');
const pool = require('../config/database');
const moment = require('moment-timezone');
const { TIME_SLOTS } = require('../config/constants');

// Time slot creation rules
const timeSlotCreate = [
  // Validate consultant exists
  body('consultant_id')
    .isUUID()
    .withMessage('Invalid consultant ID format'),

  // Validate time slot boundaries
  body(['start_time', 'end_time'])
    .isISO8601()
    .withMessage('Invalid date/time format'),

  // Validate end time is after start time
  body(['start_time', 'end_time']).custom((value, { req }) => {
    const start = moment(req.body.start_time);
    const end = moment(req.body.end_time);
    if (!end.isAfter(start)) {
      throw new Error('End time must be after start time');
    }
    return true;
  }),

  // Validate time slot is in the future
  body('start_time').custom(startTime => {
    const start = moment(startTime);
    const now = moment();
    if (start.isBefore(now)) {
      throw new Error('Cannot create slots in the past');
    }
    return true;
  }),

  // Validate duration
  body(['start_time', 'end_time']).custom((value, { req }) => {
    const start = moment(req.body.start_time);
    const end = moment(req.body.end_time);
    const durationMinutes = end.diff(start, 'minutes');
    
    if (durationMinutes < TIME_SLOTS.MIN_DURATION_MINUTES || 
        durationMinutes > TIME_SLOTS.MAX_DURATION_MINUTES) {
      throw new Error('Invalid slot duration');
    }
    return true;
  }),

  // Validate timezone
  body('timezone')
    .optional()
    .custom((value) => {
      if (!moment.tz.zone(value)) {
        throw new Error('Invalid timezone. Must be a valid IANA timezone identifier');
      }
      return true;
    }),

  // Recurring pattern validation
  body('recurring')
    .optional()
    .isObject()
    .withMessage('Recurring must be an object'),
  
  body('recurring.frequency')
    .optional()
    .isIn(['weekly', 'monthly'])
    .withMessage('Frequency must be weekly or monthly'),
  
  body('recurring.until')
    .optional()
    .isISO8601()
    .withMessage('Invalid until date format'),

  // Optional notes field
  body('notes')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Notes must not exceed 1000 characters'),
];

// Search and filter validation
const timeSlotQuery = [
  query('consultant_id')
    .optional()
    .isUUID()
    .withMessage('Invalid consultant ID format'),
  
  query('date')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format'),
  
  query('month')
    .optional()
    .matches(/^\d{4}-(?:0[1-9]|1[0-2])$/)
    .withMessage('Invalid month format (YYYY-MM)'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  
  query('limit')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Limit must be a positive integer')
    .toInt()
];

// Booking validation
const slotReservation = [
  param('slotId')
    .isUUID()
    .withMessage('Invalid slot ID format')
    .custom(async (value) => {
      const slot = await pool.query(
        'SELECT is_booked FROM time_slots WHERE id = $1',
        [value]
      );
      if (!slot.rows.length) {
        throw new Error('Time slot not found');
      }
      if (slot.rows[0].is_booked) {
        throw new Error('Time slot is not available');
      }
      return true;
    }),
  
  body('customer_id')
    .isUUID()
    .withMessage('Invalid customer ID format')
    .notEmpty()
    .withMessage('Customer ID is required')
    .custom(async (value) => {
      const customer = await pool.query(
        'SELECT id FROM customers WHERE id = $1',
        [value]
      );
      if (!customer.rows.length) {
        throw new Error('Customer not found');
      }
      return true;
    })
];

// Format validation errors for response
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    // Get the first error message
    const firstError = errors.array()[0];
    
    return res.status(400).json({
      success: false,
      error: firstError.msg  // Use the error message directly
    });
  }
  
  next();
};

module.exports = {
  timeSlotCreate,
  timeSlotQuery,
  slotReservation,
  validateRequest
};