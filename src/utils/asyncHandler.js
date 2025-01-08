// Wraps async route handlers to handle promise rejections
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    // Extract status code and message from error
    const statusCode = err.statusCode || 500;
    const errorMessage = err.message || 'Internal Server Error';

    // Send error response
    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  });
};

module.exports = asyncHandler; 