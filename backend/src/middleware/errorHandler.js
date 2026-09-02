/**
 * Central error handling.
 *
 * SECURITY: stack traces and internal messages stay on the server. Clients only
 * ever receive a short, safe message plus the HTTP status code.
 */
const logger = require("../utils/logger");
const ApiError = require("../utils/ApiError");

function notFound(req, res, next) {
  next(new ApiError(404, "The requested resource was not found."));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  // Full technical detail goes to the server log only.
  if (statusCode >= 500) {
    logger.error(err.message, err.stack);
  } else {
    logger.warn(req.method + " " + req.originalUrl + " -> " + statusCode + ": " + err.message);
  }

  const body = {
    success: false,
    message: statusCode >= 500 ? "Something went wrong. Please try again." : err.message
  };

  // Validation details are safe to return; they describe the client's own input.
  if (err.details && statusCode < 500 && Array.isArray(err.details)) {
    body.errors = err.details;
  }

  res.status(statusCode).json(body);
}

module.exports = { notFound, errorHandler };
