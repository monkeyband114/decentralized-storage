/**
 * Promote an existing account to administrator.
 *
 * Useful after a deployment, where accounts are created through the normal
 * registration form and one of them needs the administrator role. Changing a
 * role is deliberately an operator action, not something any API endpoint can
 * do - otherwise a user could promote themselves.
 *
 * Usage:
 *   node scripts/make-admin.js someone@example.com
 *   node scripts/make-admin.js someone@example.com --demote
 */
require("dotenv").config();

const mongoose = require("mongoose");
const { connectDatabase } = require("../src/config/db");
const User = require("../src/models/User");

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node scripts/make-admin.js <email> [--demote]");
    process.exit(1);
  }

  const role = process.argv.includes("--demote") ? "user" : "admin";

  await connectDatabase();

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    console.error("No account found for " + email);
    await mongoose.connection.close();
    process.exit(1);
  }

  user.role = role;
  await user.save();

  console.log(user.email + " is now a " + role + ".");
  await mongoose.connection.close();
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
