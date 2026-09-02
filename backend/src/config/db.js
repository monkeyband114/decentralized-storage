const mongoose = require("mongoose");
const config = require("./env");
const logger = require("../utils/logger");

/**
 * Opens the MongoDB connection used for users, file metadata, permissions,
 * activity logs and the local mirror of blockchain transactions.
 */
async function connectDatabase(uri = config.mongodbUri) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  logger.info(`MongoDB connected: ${mongoose.connection.name}`);
  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.connection.close();
}

module.exports = { connectDatabase, disconnectDatabase };
