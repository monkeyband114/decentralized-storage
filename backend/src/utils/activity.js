const ActivityLog = require("../models/ActivityLog");
const logger = require("./logger");

/**
 * Write one entry to the audit trail.
 *
 * SECURITY: logging succeeds or fails silently on purpose - an audit-log
 * problem must never break the user-facing operation, but it is reported to the
 * server console so it is not missed.
 * Never pass passwords, tokens or keys in `details`.
 */
async function recordActivity({ userId, action, fileId, details, status, req }) {
  try {
    await ActivityLog.create({
      userId: userId || null,
      action,
      fileId: fileId || null,
      details: details || "",
      status: status || "success",
      ipAddress: req ? req.ip : ""
    });
  } catch (err) {
    logger.error("Failed to write activity log: " + err.message);
  }
}

module.exports = { recordActivity };
