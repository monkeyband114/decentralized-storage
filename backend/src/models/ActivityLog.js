const mongoose = require("mongoose");

/**
 * Audit trail. Every security-relevant action is recorded here:
 * registration, login, upload, download, integrity check, grant, revoke and
 * every denied attempt.
 *
 * SECURITY: an append-only activity log makes unauthorised behaviour visible
 * after the fact. Passwords and keys are never written into `details`.
 */
const activityLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    action: { type: String, required: true, index: true },
    fileId: { type: String, default: null, index: true },
    details: { type: String, default: "" },
    status: { type: String, enum: ["success", "failure", "denied"], default: "success" },
    ipAddress: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now, index: true }
  },
  { versionKey: false }
);

module.exports = mongoose.model("ActivityLog", activityLogSchema);
