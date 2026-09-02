/**
 * Performance evaluation.
 *
 * Measures the metrics named in the project report:
 *   - authentication time
 *   - file upload time (and its hash / encrypt / IPFS / blockchain parts)
 *   - file retrieval time
 *   - integrity verification time
 *   - blockchain transaction time
 *
 * across a small set of file sizes.
 *
 * Prerequisites: the API, MongoDB, the IPFS daemon and the local blockchain
 * must all be running, and the development accounts must exist (npm run seed).
 *
 * Usage:
 *   npm run performance
 *   npm run performance -- --runs 5 --api http://localhost:5000
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function arg(name, fallback) {
  const index = process.argv.indexOf("--" + name);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const API = arg("api", "http://localhost:5000") + "/api";
const RUNS = Number(arg("runs", 3));
const EMAIL = arg("email", "alice@example.com");
const PASSWORD = arg("password", "UserDev2024");

const SIZES = [
  ["100 KB", 100 * 1024],
  ["500 KB", 500 * 1024],
  ["1 MB", 1024 * 1024],
  ["5 MB", 5 * 1024 * 1024],
  ["10 MB", 10 * 1024 * 1024]
];

/** Median is used rather than the mean so a single slow run cannot skew a row. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function timed(fn) {
  const start = Date.now();
  const result = await fn();
  return { ms: Date.now() - start, result };
}

async function login() {
  const { ms, result } = await timed(async () => {
    const res = await fetch(API + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    });
    if (!res.ok) {
      throw new Error("Sign-in failed. Run `npm run seed` first, or pass --email and --password.");
    }
    return res.json();
  });
  return { token: result.token, ms };
}

async function uploadOnce(token, buffer, label) {
  const form = new FormData();
  form.append("file", new Blob([buffer]), "performance-" + label.replace(/\s+/g, "") + ".txt");
  form.append("description", "Performance measurement sample");

  const { ms, result } = await timed(async () => {
    const res = await fetch(API + "/files/upload", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: form
    });
    if (!res.ok) throw new Error("Upload failed with HTTP " + res.status);
    return res.json();
  });

  return { totalMs: ms, server: result.performance, fileId: result.file.fileId };
}

async function downloadOnce(token, fileId) {
  const { ms } = await timed(async () => {
    const res = await fetch(API + "/files/" + fileId + "/download", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error("Download failed with HTTP " + res.status);
    return res.arrayBuffer();
  });
  return ms;
}

async function verifyOnce(token, fileId) {
  const { ms, result } = await timed(async () => {
    const res = await fetch(API + "/files/" + fileId + "/verify", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error("Verification failed with HTTP " + res.status);
    return res.json();
  });
  return { ms, server: result.verification.performance, result: result.result };
}

function table(rows, columns) {
  const widths = columns.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length))
  );
  const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join("  ");
  console.log(line(columns));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  rows.forEach((row) => console.log(line(columns.map((c) => row[c] ?? ""))));
}

async function main() {
  console.log("Performance evaluation");
  console.log("API: " + API + "   runs per size: " + RUNS);
  console.log("");

  // ---- Authentication -----------------------------------------------------
  const authTimes = [];
  let token;
  for (let i = 0; i < RUNS; i += 1) {
    const attempt = await login();
    token = attempt.token;
    authTimes.push(attempt.ms);
  }
  console.log("Authentication time (median of " + RUNS + " sign-ins): " + median(authTimes) + " ms");
  console.log("");

  // ---- Per size -----------------------------------------------------------
  const rows = [];
  for (const [label, bytes] of SIZES) {
    // Random content so IPFS cannot deduplicate between runs.
    const buffer = crypto.randomBytes(bytes);

    const uploads = [];
    const downloads = [];
    const verifications = [];
    let fileId;

    for (let run = 0; run < RUNS; run += 1) {
      const upload = await uploadOnce(token, buffer, label + "-" + run);
      uploads.push(upload);
      fileId = upload.fileId;

      downloads.push(await downloadOnce(token, fileId));
      verifications.push(await verifyOnce(token, fileId));
    }

    rows.push({
      "File size": label,
      "Upload total": median(uploads.map((u) => u.totalMs)) + " ms",
      Hash: median(uploads.map((u) => u.server.hashMs)) + " ms",
      Encrypt: median(uploads.map((u) => u.server.encryptMs)) + " ms",
      "IPFS upload": median(uploads.map((u) => u.server.ipfsMs)) + " ms",
      "Blockchain tx": median(uploads.map((u) => u.server.blockchainMs)) + " ms",
      Retrieval: median(downloads) + " ms",
      Verification: median(verifications.map((v) => v.ms)) + " ms"
    });

    console.log(
      label.padEnd(7) +
        " uploaded, downloaded and verified " +
        RUNS +
        " times  (last result: " +
        verifications[verifications.length - 1].result +
        ")"
    );
  }

  console.log("");
  console.log("Median timings");
  console.log("");
  table(rows, [
    "File size",
    "Upload total",
    "Hash",
    "Encrypt",
    "IPFS upload",
    "Blockchain tx",
    "Retrieval",
    "Verification"
  ]);

  // ---- Save the results ---------------------------------------------------
  const outDir = path.join(__dirname, "..", "..", "docs");
  fs.mkdirSync(outDir, { recursive: true });

  const csv = [
    Object.keys(rows[0]).join(","),
    ...rows.map((r) => Object.values(r).map((v) => String(v).replace(" ms", "")).join(","))
  ].join("\n");

  const outFile = path.join(outDir, "performance-results.csv");
  fs.writeFileSync(outFile, "All values in milliseconds\n" + csv + "\n");

  console.log("");
  console.log("Authentication time: " + median(authTimes) + " ms");
  console.log("Results written to " + outFile);
  console.log("");
  console.log(
    "Note: these figures come from a local development machine where the IPFS node\n" +
      "and the blockchain both run on localhost. Real network latency would be higher."
  );
}

main().catch((err) => {
  console.error("Performance run failed:", err.message);
  process.exit(1);
});
