/**
 * Very small logger.
 *
 * SECURITY: technical details are logged here on the server only. They are
 * never sent to the browser, so an attacker cannot learn about the internals
 * from an error message. Passwords, JWTs and encryption keys must never be
 * passed to these functions.
 */
const timestamp = () => new Date().toISOString();

const logger = {
  info: (msg, meta) => console.log(`[${timestamp()}] INFO  ${msg}`, meta ?? ""),
  warn: (msg, meta) => console.warn(`[${timestamp()}] WARN  ${msg}`, meta ?? ""),
  error: (msg, meta) => console.error(`[${timestamp()}] ERROR ${msg}`, meta ?? "")
};

module.exports = logger;
