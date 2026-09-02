/**
 * Development seed script.
 *
 * Creates one administrator and two ordinary accounts so the workflow can be
 * exercised straight away.
 *
 * IMPORTANT: these are obviously fictional development credentials. They exist
 * only to make local testing convenient. Change them (or delete the accounts)
 * before running the system anywhere other than a development machine. The
 * script refuses to run when NODE_ENV is "production".
 *
 * Usage:  npm run seed
 *         npm run seed -- --reset      (also clears files, permissions, logs)
 */
require("dotenv").config();

const mongoose = require("mongoose");
const config = require("../src/config/env");
const { connectDatabase } = require("../src/config/db");
const User = require("../src/models/User");
const File = require("../src/models/File");
const Permission = require("../src/models/Permission");
const ActivityLog = require("../src/models/ActivityLog");
const Transaction = require("../src/models/Transaction");
const blockchainService = require("../src/services/blockchainService");

const DEV_ACCOUNTS = [
  {
    name: "System Administrator",
    email: "admin@example.com",
    password: "AdminDev2024",
    role: "admin"
  },
  {
    name: "Alice Demo",
    email: "alice@example.com",
    password: "UserDev2024",
    role: "user"
  },
  {
    name: "Bob Demo",
    email: "bob@example.com",
    password: "UserDev2024",
    role: "user"
  }
];

async function seed() {
  if (config.nodeEnv === "production") {
    console.error("Refusing to seed development accounts while NODE_ENV=production.");
    process.exit(1);
  }

  await connectDatabase();

  const reset = process.argv.includes("--reset");
  if (reset) {
    await Promise.all([
      File.deleteMany({}),
      Permission.deleteMany({}),
      ActivityLog.deleteMany({}),
      Transaction.deleteMany({}),
      User.deleteMany({})
    ]);
    console.log("Cleared existing collections.");
  }

  let index = await User.countDocuments();

  for (const account of DEV_ACCOUNTS) {
    const existing = await User.findOne({ email: account.email });
    if (existing) {
      console.log("Already present: " + account.email);
      continue;
    }

    index += 1;
    const walletAddress = blockchainService.addressForIndex(index);
    const passwordHash = await User.hashPassword(account.password);

    await User.create({
      name: account.name,
      email: account.email,
      passwordHash,
      role: account.role,
      walletAddress,
      walletIndex: index
    });

    console.log("Created " + account.role.padEnd(5) + " " + account.email + "  wallet " + walletAddress);
  }

  console.log("");
  console.log("Development sign-in details (change these before any real use):");
  for (const a of DEV_ACCOUNTS) {
    console.log("  " + a.email.padEnd(22) + a.password);
  }

  await mongoose.connection.close();
}

seed().catch((err) => {
  console.error("Seeding failed:", err.message);
  process.exit(1);
});
