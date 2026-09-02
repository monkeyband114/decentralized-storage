/**
 * Runs before the test modules are loaded.
 *
 * Points the suite at a separate test database so development data is never
 * touched, and supplies fixed test secrets so the tests do not depend on the
 * developer's own .env values.
 */
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/dss_test";
process.env.JWT_SECRET = "test-only-jwt-secret-not-used-anywhere-else";
process.env.ENCRYPTION_KEY = "0".repeat(63) + "1"; // 64 hex characters
process.env.MAX_FILE_SIZE_MB = "10";
process.env.ALLOW_TAMPER_SIMULATION = "true";

// Keep the local content-addressed store used by the IPFS fallback out of the
// way of any development data.
const path = require("path");
process.env.IPFS_LOCAL_STORE_DIR = path.join(__dirname, "..", ".ipfs-test-store");
