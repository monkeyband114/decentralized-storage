/**
 * Registration, login and session endpoints.
 */
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { issueToken } = require("../middleware/auth");
const { recordActivity } = require("../utils/activity");
const blockchainService = require("../services/blockchainService");

/**
 * POST /api/auth/register
 *
 * SECURITY: the password is hashed with bcrypt before it is stored. The
 * plaintext exists only for the lifetime of this request and is never logged.
 */
async function register(req, res, next) {
  const startedAt = Date.now();
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      // Registration reveals that an address is taken; this is unavoidable for
      // a unique-email system, and login stays deliberately vague instead.
      throw new ApiError(409, "An account with this email address already exists.");
    }

    const passwordHash = await User.hashPassword(password);

    // Assign the next deterministic development wallet. Index 0 is reserved for
    // the deployer account that funds the others.
    const userCount = await User.countDocuments();
    const walletIndex = userCount + 1;
    const walletAddress = blockchainService.addressForIndex(walletIndex);

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role: "user",
      walletAddress,
      walletIndex
    });

    const token = issueToken(user);
    await recordActivity({
      userId: user._id,
      action: "REGISTER",
      details: "Account created",
      req
    });

    res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token,
      user: user.toPublicJSON(),
      durationMs: Date.now() - startedAt
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 *
 * SECURITY: the same message is returned whether the email is unknown or the
 * password is wrong, so an attacker cannot use the response to enumerate
 * registered accounts.
 */
async function login(req, res, next) {
  const startedAt = Date.now();
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      await recordActivity({
        action: "LOGIN",
        details: "Failed sign-in attempt for " + email.toLowerCase(),
        status: "failure",
        req
      });
      throw new ApiError(401, "Invalid email or password.");
    }

    const passwordOk = await user.verifyPassword(password);
    if (!passwordOk) {
      await recordActivity({
        userId: user._id,
        action: "LOGIN",
        details: "Failed sign-in attempt",
        status: "failure",
        req
      });
      throw new ApiError(401, "Invalid email or password.");
    }

    const token = issueToken(user);
    await recordActivity({ userId: user._id, action: "LOGIN", details: "Signed in", req });

    res.json({
      success: true,
      message: "Signed in successfully.",
      token,
      user: user.toPublicJSON(),
      durationMs: Date.now() - startedAt
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 *
 * JWTs are stateless, so "logging out" means the client discards its token.
 * The event is still recorded for the audit trail.
 */
async function logout(req, res, next) {
  try {
    await recordActivity({ userId: req.user._id, action: "LOGOUT", details: "Signed out", req });
    res.json({ success: true, message: "Signed out successfully." });
  } catch (err) {
    next(err);
  }
}

/** GET /api/users/me */
async function me(req, res) {
  res.json({ success: true, user: req.user.toPublicJSON() });
}

module.exports = { register, login, logout, me };
