/**
 * Hashing and file encryption.
 *
 * Two independent security mechanisms live here:
 *
 * 1. SHA-256 HASHING - proves INTEGRITY.
 *    A hash is a one-way fingerprint of the file. Changing a single byte of the
 *    file produces a completely different hash. We take the hash BEFORE
 *    encryption and record it on the blockchain, so the file can be checked
 *    against an immutable reference later.
 *
 * 2. AES-256-GCM ENCRYPTION - provides CONFIDENTIALITY (and authenticity).
 *    IPFS is a public, content-addressed network: anyone holding a CID can
 *    fetch the bytes stored there. Encrypting before upload means those bytes
 *    are useless without the key. GCM is an "authenticated" mode: it also
 *    produces an authentication tag, so tampering with the ciphertext is
 *    detected during decryption instead of yielding garbage plaintext.
 */
const crypto = require("crypto");
const config = require("./../config/env");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, the size recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

/** The 256-bit AES key, read once from the environment. */
function getKey() {
  return Buffer.from(config.encryptionKey, "hex");
}

/**
 * SHA-256 fingerprint of a buffer, as a 64-character hex string.
 * Used on the original file before encryption, and again on the decrypted file
 * during verification. The two values must match.
 */
function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Encrypt a file buffer with AES-256-GCM.
 *
 * Output layout (one self-contained blob that gets uploaded to IPFS):
 *
 *   [ 12-byte IV ][ 16-byte auth tag ][ ciphertext ... ]
 *
 * The IV and tag are not secrets - they only have to be unique/intact - so
 * storing them next to the ciphertext is safe and keeps key management simple.
 * A fresh random IV per file is essential: reusing an IV with the same key
 * breaks GCM's security.
 */
function encryptBuffer(plainBuffer) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

/**
 * Reverse of encryptBuffer.
 * If the ciphertext or the tag was modified, `decipher.final()` throws - that
 * is GCM's built-in tamper detection working.
 */
function decryptBuffer(encryptedBuffer) {
  if (encryptedBuffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Encrypted payload is too short to be valid");
  }
  const iv = encryptedBuffer.subarray(0, IV_LENGTH);
  const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encryptedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Random hex identifier used as the public fileId. */
function generateFileId() {
  return `file_${crypto.randomBytes(12).toString("hex")}`;
}

module.exports = {
  sha256,
  encryptBuffer,
  decryptBuffer,
  generateFileId,
  ALGORITHM
};
