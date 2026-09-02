/**
 * Activity (audit trail) and dashboard endpoints for the signed-in user.
 */
const ActivityLog = require("../models/ActivityLog");
const Permission = require("../models/Permission");
const File = require("../models/File");

/** GET /api/activity - the current user's own activity, newest first. */
async function listMyActivity(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await ActivityLog.find({ userId: req.user._id })
      .sort({ timestamp: -1 })
      .limit(limit);

    // Attach file names so the table reads well.
    const fileIds = logs.map((l) => l.fileId).filter(Boolean);
    const files = await File.find({ fileId: { $in: fileIds } }).select("fileId fileName");
    const nameMap = new Map(files.map((f) => [f.fileId, f.fileName]));

    res.json({
      success: true,
      activity: logs.map((l) => ({
        id: l._id.toString(),
        action: l.action,
        fileId: l.fileId,
        fileName: l.fileId ? nameMap.get(l.fileId) || null : null,
        details: l.details,
        status: l.status,
        timestamp: l.timestamp
      }))
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/dashboard - counters and recent activity shown on the dashboard. */
async function dashboard(req, res, next) {
  try {
    const myFiles = await File.find({ ownerId: req.user._id }).select("fileId");
    const myFileIds = myFiles.map((f) => f.fileId);

    const [filesShared, integrityChecks, downloads, sharedWithMe, recent] = await Promise.all([
      Permission.countDocuments({ fileId: { $in: myFileIds }, status: "active" }),
      ActivityLog.countDocuments({ userId: req.user._id, action: "VERIFY" }),
      ActivityLog.countDocuments({ userId: req.user._id, action: "DOWNLOAD", status: "success" }),
      Permission.countDocuments({ userId: req.user._id, status: "active" }),
      ActivityLog.find({ userId: req.user._id }).sort({ timestamp: -1 }).limit(8)
    ]);

    res.json({
      success: true,
      statistics: {
        files: myFiles.length,
        filesShared,
        sharedWithMe,
        integrityChecks,
        successfulDownloads: downloads
      },
      recentActivity: recent.map((l) => ({
        id: l._id.toString(),
        action: l.action,
        details: l.details,
        status: l.status,
        timestamp: l.timestamp
      }))
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMyActivity, dashboard };
