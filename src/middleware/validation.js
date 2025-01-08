const { body, query, param, validationResult } = require('express-validator');
const { isISODateFormat, isTimeFormat } = require('../utils/dateValidation');
const pool = require('../config/database');
const AppError = require('../utils/AppError');

const timeSlotCreate = [
  body('consultant_id').isUUID(),
  
  body('start_time')
    .custom((value) => {
      if (isISODateFormat(value) || isTimeFormat(value)) {
        return true;
      }
      throw new Error('Invalid format');
    })
    .withMessage('Invalid date/time format'),
  
  body('end_time')
    .custom((value) => {
      if (isISODateFormat(value) || isTimeFormat(value)) {
        return true;
      }
      throw new Error('Invalid format');
    })
    .withMessage('Invalid date/time format'),

  body('recurring').optional().isObject(),
  body('recurring.frequency').if(body('recurring').exists())
    .isIn(['weekly', 'monthly']),
  body('recurring.day_of_week').if(body('recurring.frequency').equals('weekly'))
    .isInt({ min: 0, max: 6 }),
  body('recurring.day_of_month').if(body('recurring.frequency').equals('monthly'))
    .isInt({ min: 1, max: 31 }),
  body('recurring.until').if(body('recurring').exists())
    .isISO8601()
];

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
    .custom((value) => {
      // Don't throw error for large values, just let the service handle it
      return true;
    }),
];

const slotReservation = [
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
  body('customer_id')
    .isUUID()
    .custom(async (value) => {
      const customer = await pool.query(
        'SELECT id FROM customers WHERE id = $1',
        [value]
      );
      if (!customer.rows.length) {
        const error = new Error('Customer not found');
        error.statusCode = 404;
        throw error;
      }
      return true;
    })
];

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array()[0];
    const statusCode = firstError.statusCode || 400;
    
    return res.status(statusCode).json({
      success: false,
      errors: errors.array().map(err => ({
        ...err,
        statusCode: err.statusCode || statusCode
      }))
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