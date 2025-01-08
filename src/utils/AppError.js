// Custom error class for handling operational errors
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);

    // HTTP status code (e.g., 400, 404, 500)
    this.statusCode = statusCode;

    // Set status based on status code (4xx = fail, 5xx = error)
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

    // Flag to identify operational errors vs programming errors
    this.isOperational = true;

    // Capture stack trace, excluding constructor call from stack
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError; 