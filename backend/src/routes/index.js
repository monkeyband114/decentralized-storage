/**
 * All REST routes for the application, grouped by area.
 *
 * Every route below the /auth group is protected by authenticate(), so a
 * request without a valid JWT never reaches a controller.
 */
const express = require("express");
const { body } = require("express-validator");

const authController = require("../controllers/authController");
const fileController = require("../controllers/fileController");
const activityController = require("../controllers/activityController");
const blockchainController = require("../controllers/blockchainController");
const adminController = require("../controllers/adminController");

const { authenticate, adminOnly } = require("../middleware/auth");
const { handleValidation } = require("../middleware/validate");
const { singleFile } = require("../middleware/upload");
const { authLimiter } = require("../middleware/rateLimit");

const router = express.Router();

// --------------------------------------------------------------------------
// Authentication (public)
//
// authLimiter caps how many attempts one IP address can make, which blunts
// password-guessing and automated account-creation attacks.
// --------------------------------------------------------------------------
router.post(
  "/auth/register",
  authLimiter,
  [
    body("name").trim().isLength({ min: 2, max: 80 }).withMessage("Please enter your full name."),
    body("email").isEmail().normalizeEmail().withMessage("Please enter a valid email address."),
    body("password")
      .isLength({ min: 8, max: 128 })
      .withMessage("Password must be at least 8 characters long.")
      .matches(/[A-Za-z]/)
      .withMessage("Password must contain at least one letter.")
      .matches(/[0-9]/)
      .withMessage("Password must contain at least one number.")
  ],
  handleValidation,
  authController.register
);

router.post(
  "/auth/login",
  authLimiter,
  [
    body("email").isEmail().normalizeEmail().withMessage("Please enter a valid email address."),
    body("password").isLength({ min: 1 }).withMessage("Please enter your password.")
  ],
  handleValidation,
  authController.login
);

router.post("/auth/logout", authenticate, authController.logout);

// --------------------------------------------------------------------------
// Current user
// --------------------------------------------------------------------------
router.get("/users/me", authenticate, authController.me);

// Used by the "grant access" picker: names and emails of other users only.
router.get("/users", authenticate, async (req, res, next) => {
  try {
    const User = require("../models/User");
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select("name email walletAddress")
      .sort({ name: 1 });
    res.json({
      success: true,
      users: users.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        walletAddress: u.walletAddress
      }))
    });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// Files
// --------------------------------------------------------------------------
router.post("/files/upload", authenticate, singleFile("file"), fileController.uploadFile);
router.get("/files", authenticate, fileController.listMyFiles);
router.get("/files/shared", authenticate, fileController.listSharedWithMe);
router.get("/files/:id", authenticate, fileController.getFile);
router.get("/files/:id/download", authenticate, fileController.downloadFile);
router.get("/files/:id/verify", authenticate, fileController.verifyFile);

// Access control (owner only - enforced in the controller and by the contract)
router.get("/files/:id/permissions", authenticate, fileController.listPermissions);
router.post("/files/:id/grant", authenticate, fileController.grantAccess);
router.delete("/files/:id/revoke/:userId", authenticate, fileController.revokeAccess);

// Security testing: replace the stored content so verification can be shown failing.
router.post("/files/:id/simulate-tamper", authenticate, fileController.simulateTamper);
router.post("/files/:id/restore", authenticate, fileController.restoreFile);

// --------------------------------------------------------------------------
// Activity and dashboard
// --------------------------------------------------------------------------
router.get("/activity", authenticate, activityController.listMyActivity);
router.get("/dashboard", authenticate, activityController.dashboard);

// --------------------------------------------------------------------------
// Blockchain
// --------------------------------------------------------------------------
router.get("/blockchain/transactions", authenticate, blockchainController.listTransactions);
router.get("/blockchain/status", authenticate, blockchainController.status);
router.get("/blockchain/files/:fileId", authenticate, blockchainController.onChainRecord);

// --------------------------------------------------------------------------
// Administrator (role checked on the server, not in the browser)
// --------------------------------------------------------------------------
router.get("/admin/statistics", authenticate, adminOnly, adminController.statistics);
router.get("/admin/users", authenticate, adminOnly, adminController.listUsers);
router.get("/admin/activity", authenticate, adminOnly, adminController.listActivity);
router.get("/admin/files", authenticate, adminOnly, adminController.listFiles);

module.exports = router;
