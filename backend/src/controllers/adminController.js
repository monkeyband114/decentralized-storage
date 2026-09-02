/**
 * Administrator views.
 *
 * SECURITY: an administrator can see WHO did WHAT, but has no route that
 * returns file content. Administrators are not automatically granted access to
 * a user's private files - reading a file still requires a permission recorded
 * on the smart contract by that file's owner.
 */
const User = require("../models/User");
const File = require("../models/File");
const Permission = require("../models/Permission");
const ActivityLog = require("../models/ActivityLog");
const Transaction = require("../models/Transaction");

/** GET /api/admin/statistics */
async function statistics(req, res, next) {
  try {
    const [
      totalUsers,
      totalFiles,
      totalGrants,
      totalTransactions,
      verificationAttempts,
      failedVerifications,
      deniedAttempts,
      storageAgg
    ] = await Promise.all([
      User.countDocuments(),
      File.countDocuments(),
      Permission.countDocuments({ status: "active" }),
      Transaction.countDocuments(),
      ActivityLog.countDocuments({ action: "VERIFY" }),
      ActivityLog.countDocuments({ action: "VERIFY", status: "failure" }),
      ActivityLog.countDocuments({ status: "denied" }),
      File.aggregate([{ $group: { _id: null, bytes: { $sum: "$fileSize" } } }])
    ]);

    res.json({
      success: true,
      statistics: {
        totalUsers,
        totalFiles,
        totalAccessGrants: totalGrants,
        totalTransactions,
        integrityVerificationAttempts: verificationAttempts,
        failedVerifications,
        deniedAccessAttempts: deniedAttempts,
        totalStorageBytes: storageAgg.length ? storageAgg[0].bytes : 0
      }
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/users */
async function listUsers(req, res, next) {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    const counts = await File.aggregate([{ $group: { _id: "$ownerId", total: { $sum: 1 } } }]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.total]));

    res.json({
      success: true,
      users: users.map((u) => ({
        ...u.toPublicJSON(),
        fileCount: countMap.get(u._id.toString()) || 0
      }))
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/activity - system-wide audit trail. */
async function listActivity(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const logs = await ActivityLog.find()
      .populate("userId", "name email")
      .sort({ timestamp: -1 })
      .limit(limit);

    const fileIds = logs.map((l) => l.fileId).filter(Boolean);
    const files = await File.find({ fileId: { $in: fileIds } }).select("fileId fileName");
    const nameMap = new Map(files.map((f) => [f.fileId, f.fileName]));

    res.json({
      success: true,
      activity: logs.map((l) => ({
        id: l._id.toString(),
        user: l.userId ? { name: l.userId.name, email: l.userId.email } : null,
        action: l.action,
        fileId: l.fileId,
        fileName: l.fileId ? nameMap.get(l.fileId) || null : null,
        details: l.details,
        status: l.status,
        ipAddress: l.ipAddress,
        timestamp: l.timestamp
      }))
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/files - metadata only, never file content. */
async function listFiles(req, res, next) {
  try {
    const files = await File.find().populate("ownerId", "name email").sort({ createdAt: -1 });
    res.json({
      success: true,
      files: files.map((f) => ({
        fileId: f.fileId,
        fileName: f.fileName,
        fileSize: f.fileSize,
        owner: f.ownerId ? { name: f.ownerId.name, email: f.ownerId.email } : null,
        sha256Hash: f.sha256Hash,
        ipfsCid: f.ipfsCid,
        blockchainTxHash: f.blockchainTxHash,
        accessLevel: f.accessLevel,
        lastVerificationResult: f.lastVerificationResult,
        createdAt: f.createdAt
      }))
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { statistics, listUsers, listActivity, listFiles };
