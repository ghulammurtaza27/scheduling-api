const { body, query, param, validationResult } = require('express-validator');
const { isISODateFormat, isTimeFormat } = require('../utils/dateValidation');
const pool = require('../config/database');

// Time slot creation validation rules
const timeSlotCreate = [
  // Basic fields
  body('consultant_id')
    .isUUID()
    .withMessage('Invalid consultant ID format'),

  // Time validation
  body('start_time')
    .isISO8601()
    .withMessage('Invalid start time format'),
  
  body('end_time')
    .isISO8601()
    .withMessage('Invalid end time format'),

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
];

// Query parameters validation
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

// Reservation validation
const slotReservation = [
  param('slotId')
    .isUUID()
    .withMessage('Invalid slot ID format')
    .custom(validateSlotAvailability),
  
  body('customer_id')
    .isUUID()
    .withMessage('Invalid customer ID format')
    .notEmpty()
    .withMessage('Customer ID is required')
    .custom(validateCustomerExists)
];

// Helper functions
function validateDateTime(value) {
  if (isISODateFormat(value) || isTimeFormat(value)) {
    return true;
  }
  throw new Error('Invalid format');
}

async function validateSlotAvailability(value) {
  const slot = await pool.query(
    'SELECT is_booked FROM time_slots WHERE id = $1',
    [value]
  );
  if (!slot.rows.length) throw new Error('Time slot not found');
  if (slot.rows[0].is_booked) throw new Error('Time slot is not available');
  return true;
}

async function validateCustomerExists(value) {
  const customer = await pool.query(
    'SELECT id FROM customers WHERE id = $1',
    [value]
  );
  if (!customer.rows.length) {
    throw new Error('Customer not found');
  }
  return true;
}

// Validation result handler
function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array()[0];
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
}

module.exports = {
  timeSlotCreate,
  timeSlotQuery,
  slotReservation,
  validateRequest
};