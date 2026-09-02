/**
 * Error type carrying an HTTP status code.
 *
 * Throwing `new ApiError(403, "Access denied...")` lets the central error
 * handler return a clean JSON message to the client while the stack trace
 * stays on the server.
 */
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
