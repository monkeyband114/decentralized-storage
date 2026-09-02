/**
 * Rate limiting.
 *
 * SECURITY: without a limit, an attacker can try thousands of passwords per
 * minute against the login endpoint. Capping attempts per IP address makes
 * online brute-force and credential-stuffing attacks impractical.
 */
const rateLimit = require("express-rate-limit");

/** Strict limit for the authentication endpoints. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts from this address. Please wait 15 minutes and try again."
  },
  // Tests would otherwise trip the limiter while exercising invalid logins.
  skip: () => process.env.NODE_ENV === "test"
});

/** Gentler limit applied to the rest of the API. */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please slow down." },
  skip: () => process.env.NODE_ENV === "test"
});

module.exports = { authLimiter, apiLimiter };
