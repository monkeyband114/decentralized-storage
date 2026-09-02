/**
 * Express application setup.
 *
 * The order of the middleware matters: security headers and CORS run first,
 * then body parsing, then the routes, and finally the error handlers.
 */
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const config = require("./config/env");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { apiLimiter } = require("./middleware/rateLimit");

const app = express();

// Behind a proxy, this makes req.ip the real client address (used by rate
// limiting and the audit log).
app.set("trust proxy", 1);

// SECURITY: Helmet sets protective HTTP response headers - it disables MIME
// sniffing, blocks the page from being framed (clickjacking), removes the
// X-Powered-By fingerprint and enables a strict referrer policy.
app.use(helmet());

// SECURITY: CORS is restricted to known frontend origins, so a random website
// cannot make authenticated calls to this API from a victim's browser.
// CLIENT_URL accepts a comma-separated list, which is what a deployed setup
// needs: the production frontend, its preview deployments and localhost.
app.use(
  cors({
    origin(origin, callback) {
      // Requests with no Origin header (curl, server-to-server, health checks)
      // are not browser cross-origin requests, so there is nothing to block.
      if (!origin) return callback(null, true);
      const allowed = config.clientUrls.includes(origin.replace(/\/$/, ""));
      return callback(null, allowed);
    },
    credentials: true,
    exposedHeaders: ["X-Integrity-Status", "X-File-Hash", "Content-Disposition"]
  })
);

// Body limits keep oversized JSON payloads from exhausting memory. File uploads
// are handled separately by multer with their own size limit.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Simple health check, useful when starting the stack.
app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", apiLimiter, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
