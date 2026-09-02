/**
 * File upload handling (multer).
 *
 * SECURITY:
 *  - memoryStorage keeps the plaintext file in RAM only. It is hashed and
 *    encrypted immediately, so an unencrypted copy is never written to disk.
 *  - a size limit protects the server from resource-exhaustion uploads.
 *  - an allowlist of extensions/MIME types rejects file types we do not accept.
 *    An allowlist is safer than a blocklist: anything unexpected is refused.
 */
const path = require("path");
const multer = require("multer");
const config = require("../config/env");
const ApiError = require("../utils/ApiError");

const ALLOWED_EXTENSIONS = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".txt", ".csv", ".json", ".xml", ".md",
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".zip"
];

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "text/markdown", "text/xml",
  "application/json", "application/xml",
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/zip", "application/x-zip-compressed",
  "application/octet-stream"
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSizeMb * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new ApiError(400, "This file type is not allowed. Accepted types: " + ALLOWED_EXTENSIONS.join(", ")));
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new ApiError(400, "This file type is not allowed."));
    }
    cb(null, true);
  }
});

/** Wrap multer so its own errors become clean API messages. */
function singleFile(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(new ApiError(413, "File is too large. The maximum size is " + config.maxFileSizeMb + " MB."));
        }
        return next(new ApiError(400, "Upload failed: " + err.message));
      }
      next(err);
    });
  };
}

module.exports = { singleFile, ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES };
