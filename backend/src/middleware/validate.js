/**
 * Input validation.
 *
 * SECURITY: never trust anything sent by a client. Validating and normalising
 * input here keeps malformed or malicious values out of the database and out of
 * the blockchain calls.
 */
const { validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const first = errors.array()[0];
  next(new ApiError(400, first.msg, errors.array().map((e) => ({ field: e.path, message: e.msg }))));
}

module.exports = { handleValidation };
