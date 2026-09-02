/** Shared helpers for the API tests. */
const mongoose = require("mongoose");
const request = require("supertest");

const app = require("../src/app");
const User = require("../src/models/User");
const File = require("../src/models/File");
const Permission = require("../src/models/Permission");
const ActivityLog = require("../src/models/ActivityLog");
const Transaction = require("../src/models/Transaction");
const blockchainService = require("../src/services/blockchainService");

async function connect() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  }
}

async function disconnect() {
  await mongoose.connection.close();
}

/** Empty every collection and reset the simulated chain. */
async function clearAll() {
  await Promise.all([
    User.deleteMany({}),
    File.deleteMany({}),
    Permission.deleteMany({}),
    ActivityLog.deleteMany({}),
    Transaction.deleteMany({})
  ]);
  if (blockchainService.__reset) blockchainService.__reset();
}

/** Register a user through the API and return their token and profile. */
async function createUser({ name, email, password = "TestPass123", role }) {
  const response = await request(app).post("/api/auth/register").send({ name, email, password });

  if (role && role !== "user") {
    await User.updateOne({ email: email.toLowerCase() }, { role });
    const login = await request(app).post("/api/auth/login").send({ email, password });
    return { token: login.body.token, user: login.body.user, password };
  }

  return { token: response.body.token, user: response.body.user, password };
}

/** Upload a buffer as a file and return the created file record. */
async function uploadFile(token, { content, fileName = "document.txt", description = "" }) {
  const response = await request(app)
    .post("/api/files/upload")
    .set("Authorization", `Bearer ${token}`)
    .field("description", description)
    .attach("file", Buffer.from(content), { filename: fileName, contentType: "text/plain" });
  return response;
}

/**
 * Supertest parses text and JSON responses automatically; a downloaded file is
 * raw binary, so it needs its own parser to reach the test as a Buffer.
 */
function binaryParser(res, callback) {
  res.setEncoding("binary");
  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });
  res.on("end", () => callback(null, Buffer.from(data, "binary")));
}

module.exports = { app, connect, disconnect, clearAll, createUser, uploadFile, binaryParser };
