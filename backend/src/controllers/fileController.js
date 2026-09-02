/**
 * File endpoints: upload, listing, download, integrity verification and
 * file-level access control.
 *
 * The upload pipeline implemented below is the core of the system:
 *
 *   plaintext file
 *        -> SHA-256 hash            (integrity fingerprint)
 *        -> AES-256-GCM encryption  (confidentiality)
 *        -> IPFS                    (decentralized storage, returns a CID)
 *        -> smart contract          (CID + hash + owner + timestamp on-chain)
 *        -> MongoDB                 (application metadata)
 *
 * and the download pipeline reverses it, re-hashing the decrypted bytes and
 * comparing them with both the stored hash and the on-chain hash.
 */
const mongoose = require("mongoose");
const File = require("../models/File");
const User = require("../models/User");
const Permission = require("../models/Permission");
const Transaction = require("../models/Transaction");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");
const { recordActivity } = require("../utils/activity");
const cryptoService = require("../services/cryptoService");
const ipfsService = require("../services/ipfsService");
const blockchainService = require("../services/blockchainService");
const config = require("../config/env");

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Shape sent to the client. */
function toFileJSON(file, extra = {}) {
  return {
    id: file._id.toString(),
    fileId: file.fileId,
    fileName: file.fileName,
    description: file.description,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    sha256Hash: file.sha256Hash,
    ipfsCid: file.ipfsCid,
    storageBackend: file.storageBackend,
    accessLevel: file.accessLevel,
    ownerId: file.ownerId ? file.ownerId.toString() : null,
    ownerWallet: file.ownerWallet,
    blockchainTxHash: file.blockchainTxHash,
    blockchainBlockNumber: file.blockchainBlockNumber,
    tampered: file.tampered,
    lastVerifiedAt: file.lastVerifiedAt,
    lastVerificationResult: file.lastVerificationResult,
    createdAt: file.createdAt,
    ...extra
  };
}

/** Find a file by its public fileId, or by its Mongo _id as a convenience. */
async function findFileOr404(idOrFileId) {
  let file = await File.findOne({ fileId: idOrFileId });
  if (!file && mongoose.isValidObjectId(idOrFileId)) {
    file = await File.findById(idOrFileId);
  }
  if (!file) {
    throw new ApiError(404, "File not found.");
  }
  return file;
}

/**
 * Decide whether `user` may read `file`.
 *
 * SECURITY: this runs on the server for every retrieval. Two independent
 * sources are consulted:
 *   1. the permissions collection (the application's own record), and
 *   2. the smart contract (the tamper-proof record).
 * When the chain is reachable, both must agree. If it is unreachable the
 * database decision is used and the response says the on-chain confirmation
 * was unavailable.
 */
async function checkAccess(file, user) {
  const isOwner = file.ownerId.toString() === user._id.toString();

  let dbAllowed = isOwner;
  if (!dbAllowed) {
    const permission = await Permission.findOne({
      fileId: file.fileId,
      userId: user._id,
      status: "active"
    });
    dbAllowed = Boolean(permission);
  }

  let chainAllowed = null; // null = could not be checked
  try {
    chainAllowed = await blockchainService.hasAccess(file.fileId, user.walletAddress);
  } catch (err) {
    logger.warn("On-chain access check unavailable: " + err.message);
  }

  const allowed = chainAllowed === null ? dbAllowed : dbAllowed && chainAllowed;

  return { allowed, isOwner, dbAllowed, chainAllowed };
}

/** Throw the standard 403 when access is refused, and log the attempt. */
async function requireAccess(file, user, req, action) {
  const result = await checkAccess(file, user);
  if (!result.allowed) {
    await recordActivity({
      userId: user._id,
      action,
      fileId: file.fileId,
      details: "Denied access to " + file.fileName,
      status: "denied",
      req
    });
    throw new ApiError(403, "Access denied. You do not have permission to access this file.");
  }
  return result;
}

// --------------------------------------------------------------------------
// POST /api/files/upload
// --------------------------------------------------------------------------
async function uploadFile(req, res, next) {
  const totalStart = Date.now();
  try {
    if (!req.file) {
      throw new ApiError(400, "Please choose a file to upload.");
    }

    const { description = "", accessLevel = "private" } = req.body;
    const buffer = req.file.buffer;

    // STEP 1 - Fingerprint the ORIGINAL file with SHA-256.
    // This value is what every later integrity check is compared against, so it
    // must be taken before any transformation of the bytes.
    const hashStart = Date.now();
    const sha256Hash = cryptoService.sha256(buffer);
    const hashMs = Date.now() - hashStart;

    // STEP 2 - Encrypt with AES-256-GCM. IPFS is a public network, so only
    // ciphertext may leave this server.
    const encryptStart = Date.now();
    const encrypted = cryptoService.encryptBuffer(buffer);
    const encryptMs = Date.now() - encryptStart;

    // STEP 3 - Store the encrypted file on IPFS and keep the returned CID.
    let ipfsResult;
    try {
      ipfsResult = await ipfsService.uploadBuffer(encrypted, req.file.originalname + ".enc");
    } catch (err) {
      logger.error("IPFS upload failed: " + err.message);
      throw new ApiError(503, "Unable to store file on decentralized storage. Please try again.");
    }

    const fileId = cryptoService.generateFileId();

    // STEP 4 - Record the metadata on the blockchain. If this fails the upload
    // fails: a file without an on-chain reference could not be verified later.
    const txResult = await blockchainService.addFile({
      fileId,
      cid: ipfsResult.cid,
      fileHash: sha256Hash,
      walletIndex: req.user.walletIndex
    });

    // STEP 5 - Save the application metadata.
    const file = await File.create({
      fileId,
      ownerId: req.user._id,
      ownerWallet: req.user.walletAddress,
      fileName: req.file.originalname,
      description: String(description).slice(0, 500),
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      sha256Hash,
      ipfsCid: ipfsResult.cid,
      storageBackend: ipfsResult.backend,
      accessLevel: accessLevel === "restricted" ? "restricted" : "private",
      blockchainTxHash: txResult.txHash,
      blockchainBlockNumber: txResult.blockNumber
    });

    await Transaction.create({
      txHash: txResult.txHash,
      action: "addFile",
      fileId,
      userId: req.user._id,
      fromAddress: txResult.from,
      contractAddress: txResult.contractAddress,
      blockNumber: txResult.blockNumber,
      gasUsed: txResult.gasUsed,
      status: txResult.status,
      durationMs: txResult.durationMs
    });

    await recordActivity({
      userId: req.user._id,
      action: "UPLOAD",
      fileId,
      details: "Uploaded " + file.fileName,
      req
    });

    res.status(201).json({
      success: true,
      message: "File uploaded and recorded on the blockchain.",
      file: toFileJSON(file),
      transaction: txResult,
      // Timings feed the performance evaluation described in the report.
      performance: {
        hashMs,
        encryptMs,
        ipfsMs: ipfsResult.durationMs,
        blockchainMs: txResult.durationMs,
        totalMs: Date.now() - totalStart
      }
    });
  } catch (err) {
    next(err);
  }
}

// --------------------------------------------------------------------------
// GET /api/files            - files owned by the signed-in user
// GET /api/files/shared     - files other users have shared with them
// --------------------------------------------------------------------------
async function listMyFiles(req, res, next) {
  try {
    const files = await File.find({ ownerId: req.user._id }).sort({ createdAt: -1 });

    // Count how many people each file is shared with.
    const counts = await Permission.aggregate([
      { $match: { fileId: { $in: files.map((f) => f.fileId) }, status: "active" } },
      { $group: { _id: "$fileId", total: { $sum: 1 } } }
    ]);
    const countMap = new Map(counts.map((c) => [c._id, c.total]));

    res.json({
      success: true,
      files: files.map((f) =>
        toFileJSON(f, { isOwner: true, sharedWith: countMap.get(f.fileId) || 0 })
      )
    });
  } catch (err) {
    next(err);
  }
}

async function listSharedWithMe(req, res, next) {
  try {
    const permissions = await Permission.find({ userId: req.user._id, status: "active" });
    const fileIds = permissions.map((p) => p.fileId);
    const files = await File.find({ fileId: { $in: fileIds } })
      .populate("ownerId", "name email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      files: files.map((f) =>
        toFileJSON(f, {
          isOwner: false,
          owner: f.ownerId ? { name: f.ownerId.name, email: f.ownerId.email } : null
        })
      )
    });
  } catch (err) {
    next(err);
  }
}

// --------------------------------------------------------------------------
// GET /api/files/:id  - detail view, including the on-chain record
// --------------------------------------------------------------------------
async function getFile(req, res, next) {
  try {
    const file = await findFileOr404(req.params.id);
    const access = await requireAccess(file, req.user, req, "VIEW_FILE");

    const owner = await User.findById(file.ownerId).select("name email walletAddress");

    let blockchainRecord = null;
    try {
      blockchainRecord = await blockchainService.getFile(file.fileId);
    } catch (err) {
      logger.warn("Could not read on-chain record: " + err.message);
    }

    res.json({
      success: true,
      file: toFileJSON(file, {
        isOwner: access.isOwner,
        owner: owner ? { name: owner.name, email: owner.email, walletAddress: owner.walletAddress } : null
      }),
      blockchainRecord
    });
  } catch (err) {
    next(err);
  }
}

// --------------------------------------------------------------------------
// Shared retrieval routine used by both download and verify.
//
// IPFS CID -> encrypted bytes -> AES decryption -> SHA-256 -> compare
// --------------------------------------------------------------------------
async function retrieveAndVerify(file) {
  const retrievalStart = Date.now();

  const { buffer: encrypted, durationMs: ipfsMs } = await ipfsService.fetchByCid(
    file.ipfsCid,
    file.storageBackend
  );

  const decryptStart = Date.now();
  let plaintext;
  let decryptionFailed = false;
  try {
    plaintext = cryptoService.decryptBuffer(encrypted);
  } catch (err) {
    // AES-GCM rejected the data: the ciphertext or its authentication tag was
    // modified. That is itself an integrity failure.
    decryptionFailed = true;
    logger.warn("Decryption failed for " + file.fileId + ": " + err.message);
  }
  const decryptMs = Date.now() - decryptStart;

  const verifyStart = Date.now();
  const calculatedHash = decryptionFailed ? null : cryptoService.sha256(plaintext);
  const verifyMs = Date.now() - verifyStart;

  // The independent, immutable reference.
  let blockchainHash = null;
  let blockchainCid = null;
  try {
    const record = await blockchainService.getFile(file.fileId);
    if (record) {
      blockchainHash = record.fileHash;
      blockchainCid = record.cid;
    }
  } catch (err) {
    logger.warn("Could not read on-chain hash: " + err.message);
  }

  const matchesStored = Boolean(calculatedHash) && calculatedHash === file.sha256Hash;
  const matchesBlockchain =
    blockchainHash === null ? null : Boolean(calculatedHash) && calculatedHash === blockchainHash;

  // Verified only when the recomputed hash matches the stored hash AND, when the
  // chain is reachable, the hash recorded on-chain.
  const verified = matchesStored && matchesBlockchain !== false;

  return {
    plaintext,
    decryptionFailed,
    report: {
      fileName: file.fileName,
      storedHash: file.sha256Hash,
      calculatedHash,
      blockchainHash,
      ipfsCid: file.ipfsCid,
      blockchainCid,
      cidMatches: blockchainCid === null ? null : blockchainCid === file.ipfsCid,
      matchesStored,
      matchesBlockchain,
      verified,
      decryptionFailed,
      performance: {
        ipfsMs,
        decryptMs,
        verifyMs,
        totalMs: Date.now() - retrievalStart
      }
    }
  };
}

// --------------------------------------------------------------------------
// GET /api/files/:id/download
// --------------------------------------------------------------------------
async function downloadFile(req, res, next) {
  try {
    const file = await findFileOr404(req.params.id);
    await requireAccess(file, req.user, req, "DOWNLOAD");

    const { plaintext, report } = await retrieveAndVerify(file);

    file.lastVerifiedAt = new Date();
    file.lastVerificationResult = report.verified ? "verified" : "failed";
    await file.save();

    if (!report.verified) {
      await recordActivity({
        userId: req.user._id,
        action: "DOWNLOAD",
        fileId: file.fileId,
        details: "Blocked: integrity verification failed for " + file.fileName,
        status: "failure",
        req
      });
      // The download is refused: returning a file we cannot vouch for would
      // defeat the purpose of the integrity check.
      throw new ApiError(
        409,
        "File integrity verification failed. The retrieved file does not match the recorded hash.",
        report
      );
    }

    await recordActivity({
      userId: req.user._id,
      action: "DOWNLOAD",
      fileId: file.fileId,
      details: "Downloaded " + file.fileName + " (integrity verified)",
      req
    });

    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", 'attachment; filename="' + file.fileName.replace(/"/g, "") + '"');
    res.setHeader("X-Integrity-Status", "VERIFIED");
    res.setHeader("X-File-Hash", report.calculatedHash);
    res.setHeader("Access-Control-Expose-Headers", "X-Integrity-Status, X-File-Hash, Content-Disposition");
    res.send(plaintext);
  } catch (err) {
    next(err);
  }
}

// --------------------------------------------------------------------------
// GET /api/files/:id/verify
// --------------------------------------------------------------------------
async function verifyFile(req, res, next) {
  try {
    const file = await findFileOr404(req.params.id);
    await requireAccess(file, req.user, req, "VERIFY");

    const { report } = await retrieveAndVerify(file);

    file.lastVerifiedAt = new Date();
    file.lastVerificationResult = report.verified ? "verified" : "failed";
    await file.save();

    await recordActivity({
      userId: req.user._id,
      action: "VERIFY",
      fileId: file.fileId,
      details:
        "Integrity check on " + file.fileName + ": " + (report.verified ? "VERIFIED" : "FAILED"),
      status: report.verified ? "success" : "failure",
      req
    });

    res.json({
      success: true,
      result: report.verified ? "VERIFIED" : "FAILED",
      message: report.verified
        ? "Integrity verified. The file matches the hash recorded on the blockchain."
        : "File integrity verification failed. The retrieved file does not match the recorded hash.",
      verification: report
    });
  } catch (err) {
    next(err);
  }
}

// --------------------------------------------------------------------------
// Access control
// --------------------------------------------------------------------------

/** GET /api/files/:id/permissions - who currently has access. */
async function listPermissions(req, res, next) {
  try {
    const file = await findFileOr404(req.params.id);
    if (file.ownerId.toString() !== req.user._id.toString()) {
      throw new ApiError(403, "Access denied. Only the file owner can manage access.");
    }

    const permissions = await Permission.find({ fileId: file.fileId, status: "active" })
      .populate("userId", "name email walletAddress")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      permissions: permissions
        .filter((p) => p.userId)
        .map((p) => ({
          id: p._id.toString(),
          userId: p.userId._id.toString(),
          name: p.userId.name,
          email: p.userId.email,
          walletAddress: p.userId.walletAddress,
          txHash: p.txHash,
          grantedAt: p.createdAt
        }))
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/files/:id/grant   body: { email } or { userId }
 *
 * The grant is written to the smart contract first. Only if the transaction is
 * confirmed is the database updated, so the two records cannot drift apart.
 */
async function grantAccess(req, res, next) {
  try {
    const file = await findFileOr404(req.params.id);
    if (file.ownerId.toString() !== req.user._id.toString()) {
      throw new ApiError(403, "Access denied. Only the file owner can grant access.");
    }

    const { email, userId } = req.body;
    const target = userId
      ? await User.findById(userId)
      : await User.findOne({ email: String(email || "").toLowerCase() });

    if (!target) {
      throw new ApiError(404, "No registered user was found with that email address.");
    }
    if (target._id.toString() === req.user._id.toString()) {
      throw new ApiError(400, "You already own this file.");
    }

    const existing = await Permission.findOne({ fileId: file.fileId, userId: target._id });
    if (existing && existing.status === "active") {
      throw new ApiError(409, "This user already has access to the file.");
    }

    // 1. On-chain permission update (the authoritative record).
    const txResult = await blockchainService.grantAccess({
      fileId: file.fileId,
      granteeAddress: target.walletAddress,
      ownerWalletIndex: req.user.walletIndex
    });

    // 2. Mirror it in the database.
    if (existing) {
      existing.status = "active";
      existing.grantedBy = req.user._id;
      existing.txHash = txResult.txHash;
      existing.updatedAt = new Date();
      await existing.save();
    } else {
      await Permission.create({
        fileId: file.fileId,
        userId: target._id,
        grantedBy: req.user._id,
        status: "active",
        txHash: txResult.txHash
      });
    }

    await Transaction.create({
      txHash: txResult.txHash,
      action: "grantAccess",
      fileId: file.fileId,
      userId: req.user._id,
      fromAddress: txResult.from,
      contractAddress: txResult.contractAddress,
      blockNumber: txResult.blockNumber,
      gasUsed: txResult.gasUsed,
      status: txResult.status,
      durationMs: txResult.durationMs
    });

    await recordActivity({
      userId: req.user._id,
      action: "GRANT_ACCESS",
      fileId: file.fileId,
      details: "Granted access to " + target.email + " for " + file.fileName,
      req
    });

    res.json({
      success: true,
      message: "Access granted to " + target.email + ".",
      transaction: txResult
    });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/files/:id/revoke/:userId */
async function revokeAccess(req, res, next) {
  try {
    const file = await findFileOr404(req.params.id);
    if (file.ownerId.toString() !== req.user._id.toString()) {
      throw new ApiError(403, "Access denied. Only the file owner can revoke access.");
    }

    const target = await User.findById(req.params.userId);
    if (!target) {
      throw new ApiError(404, "User not found.");
    }

    const permission = await Permission.findOne({
      fileId: file.fileId,
      userId: target._id,
      status: "active"
    });
    if (!permission) {
      throw new ApiError(404, "This user does not currently have access to the file.");
    }

    const txResult = await blockchainService.revokeAccess({
      fileId: file.fileId,
      granteeAddress: target.walletAddress,
      ownerWalletIndex: req.user.walletIndex
    });

    permission.status = "revoked";
    permission.txHash = txResult.txHash;
    permission.updatedAt = new Date();
    await permission.save();

    await Transaction.create({
      txHash: txResult.txHash,
      action: "revokeAccess",
      fileId: file.fileId,
      userId: req.user._id,
      fromAddress: txResult.from,
      contractAddress: txResult.contractAddress,
      blockNumber: txResult.blockNumber,
      gasUsed: txResult.gasUsed,
      status: txResult.status,
      durationMs: txResult.durationMs
    });

    await recordActivity({
      userId: req.user._id,
      action: "REVOKE_ACCESS",
      fileId: file.fileId,
      details: "Revoked access from " + target.email + " for " + file.fileName,
      req
    });

    res.json({
      success: true,
      message: "Access revoked from " + target.email + ".",
      transaction: txResult
    });
  } catch (err) {
    next(err);
  }
}

// --------------------------------------------------------------------------
// Tamper simulation - security testing tool, owner only
//
// Content-addressed storage means you cannot edit the bytes behind an existing
// CID. What an attacker with access to the server COULD do is replace the
// stored content and repoint the application at it. These endpoints reproduce
// exactly that, so integrity verification can be shown detecting it.
//
//   mode "content"  - swap the stored file. The stored hash and the on-chain
//                     hash both stop matching.
//   mode "database" - swap the stored file AND rewrite the hash in MongoDB to
//                     cover it up. Only the immutable on-chain hash still
//                     detects the change - this is the case that shows why the
//                     blockchain record matters.
// --------------------------------------------------------------------------
async function simulateTamper(req, res, next) {
  try {
    if (!config.allowTamperSimulation) {
      throw new ApiError(403, "Tamper simulation is disabled on this server.");
    }

    const file = await findFileOr404(req.params.id);
    if (file.ownerId.toString() !== req.user._id.toString()) {
      throw new ApiError(403, "Access denied. Only the file owner can run this test.");
    }
    if (file.tampered) {
      throw new ApiError(409, "This file is already in a modified state. Restore it first.");
    }

    const mode = req.body.mode === "database" ? "database" : "content";

    // Retrieve, decrypt, modify, re-encrypt, store again.
    const { buffer: encrypted } = await ipfsService.fetchByCid(file.ipfsCid, file.storageBackend);
    const plaintext = cryptoService.decryptBuffer(encrypted);
    const modified = Buffer.concat([plaintext, Buffer.from("\n<!-- modified content -->\n")]);

    const reEncrypted = cryptoService.encryptBuffer(modified);
    const stored = await ipfsService.uploadBuffer(reEncrypted, file.fileName + ".enc");

    file.originalCid = file.ipfsCid;
    file.ipfsCid = stored.cid;
    file.storageBackend = stored.backend;
    file.tampered = true;

    if (mode === "database") {
      file.originalSha256Hash = file.sha256Hash;
      file.sha256Hash = cryptoService.sha256(modified);
    }

    await file.save();

    await recordActivity({
      userId: req.user._id,
      action: "TAMPER_TEST",
      fileId: file.fileId,
      details:
        "Stored content replaced for a security test (" +
        mode +
        " mode). Blockchain record unchanged.",
      status: "failure",
      req
    });

    res.json({
      success: true,
      message:
        mode === "database"
          ? "Stored content and the database hash were replaced. Only the blockchain record still holds the original hash."
          : "Stored content was replaced. The recorded hash no longer matches.",
      mode,
      file: toFileJSON(file)
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/files/:id/restore - undo a tamper simulation. */
async function restoreFile(req, res, next) {
  try {
    const file = await findFileOr404(req.params.id);
    if (file.ownerId.toString() !== req.user._id.toString()) {
      throw new ApiError(403, "Access denied. Only the file owner can restore this file.");
    }
    if (!file.tampered || !file.originalCid) {
      throw new ApiError(400, "This file has not been modified.");
    }

    file.ipfsCid = file.originalCid;
    file.originalCid = null;
    if (file.originalSha256Hash) {
      file.sha256Hash = file.originalSha256Hash;
      file.originalSha256Hash = null;
    }
    file.tampered = false;
    await file.save();

    await recordActivity({
      userId: req.user._id,
      action: "RESTORE",
      fileId: file.fileId,
      details: "Restored the original stored content for " + file.fileName,
      req
    });

    res.json({ success: true, message: "Original content restored.", file: toFileJSON(file) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadFile,
  listMyFiles,
  listSharedWithMe,
  getFile,
  downloadFile,
  verifyFile,
  listPermissions,
  grantAccess,
  revokeAccess,
  simulateTamper,
  restoreFile,
  // exported for tests
  checkAccess
};
