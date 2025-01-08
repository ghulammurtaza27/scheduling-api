class ResponseHandler {
  static success(res, { statusCode = 200, message = '', data = null }) {
    return res.status(statusCode).json({
      success: true,
      ...(message && { message }),
      ...(data && { data })
    });
  }

  static error(res, { statusCode = 400, message = 'An error occurred' }) {
    return res.status(statusCode).json({
      success: false,
      error: message,
      details: message
    });
  }

  static handleDatabaseError(err) {
    // If it's already an AppError, use its status code
    if (err.statusCode) {
      return {
        statusCode: err.statusCode,
        message: err.message
      };
    }

    const errorMap = {
      '23505': { statusCode: 409, message: 'Resource already exists' },
      '23503': { statusCode: 400, message: 'Referenced record not found' },
      '22P02': { statusCode: 400, message: 'Invalid input format' }
    };

    // Default to 400 for validation errors, 500 for others
    const isValidationError = err.message.includes('overlaps') ||
                            err.message.includes('duration') ||
                            err.message.includes('booked') ||
                            err.message.includes('not found') ||
                            err.message.includes('invalid') ||
                            err.message.includes('format');

    return {
      statusCode: errorMap[err.code]?.statusCode || (isValidationError ? 400 : 500),
      message: errorMap[err.code]?.message || err.message
    };
  }
}

module.exports = ResponseHandler; 