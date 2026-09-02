/**
 * Authentication and authorisation middleware.
 *
 * authenticate() - proves WHO the caller is, by validating a signed JWT.
 * authorize()    - restricts a route to particular roles.
 * adminOnly()    - shorthand for authorize("admin").
 *
 * SECURITY: every protected route goes through authenticate() on the SERVER.
 * Hiding a button in the browser is not security - the browser is under the
 * attacker's control, so the check must happen here.
 */
const jwt = require("jsonwebtoken");
const config = require("../config/env");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");

/**
 * Sign a JWT containing the user id and role.
 * The token is signed with JWT_SECRET; a client cannot change the role inside
 * it without invalidating the signature.
 */
function issueToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/** Read "Authorization: Bearer <token>" and attach the user to the request. */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      throw new ApiError(401, "Authentication required. Please sign in.");
    }

    const token = header.slice(7).trim();
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      // Covers expired tokens, bad signatures and malformed tokens alike.
      throw new ApiError(401, "Your session has expired. Please sign in again.");
    }

    // The token is only a claim - confirm the account still exists.
    const user = await User.findById(payload.sub);
    if (!user) {
      throw new ApiError(401, "Account no longer exists.");
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Allow only the listed roles through. */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication required. Please sign in."));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, "Access denied. Insufficient privileges."));
    }
    next();
  };
}

const adminOnly = authorize("admin");

module.exports = { issueToken, authenticate, authorize, adminOnly };
