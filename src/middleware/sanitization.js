const xss = require('xss');
const validator = require('validator');

/**
 * Sanitizes request data to prevent XSS and SQL injection
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const sanitizeInput = (req, res, next) => {
  // Sanitize body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize URL parameters
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

/**
 * Recursively sanitizes an object's string values
 * @param {Object} obj - Object to sanitize
 * @returns {Object} Sanitized object
 */
const sanitizeObject = (obj) => {
  const clean = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      clean[key] = value;
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = sanitizeObject(value);
      continue;
    }

    if (Array.isArray(value)) {
      clean[key] = value.map(item => 
        typeof item === 'object' ? sanitizeObject(item) : sanitizeValue(item)
      );
      continue;
    }

    clean[key] = sanitizeValue(value);
  }

  return clean;
};

/**
 * Sanitizes a single value based on its type
 * @param {any} value - Value to sanitize
 * @returns {any} Sanitized value
 */
const sanitizeValue = (value) => {
  // Handle non-string values
  if (typeof value !== 'string') {
    return value;
  }

  // UUID validation
  if (validator.isUUID(value)) {
    return value;
  }

  // ISO date validation
  if (validator.isISO8601(value)) {
    return value;
  }

  // Email validation
  if (validator.isEmail(value)) {
    return validator.normalizeEmail(value);
  }

  // Sanitize HTML/JavaScript
  return xss(value.trim());
};

module.exports = sanitizeInput; 