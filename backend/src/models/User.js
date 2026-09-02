const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const config = require("../config/env");

/**
 * Application user.
 *
 * SECURITY: the plaintext password is never stored. Only a bcrypt hash is kept
 * (`passwordHash`). bcrypt is deliberately slow and salts every hash, which
 * makes brute-force and rainbow-table attacks impractical.
 */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    // Address used to sign this user's transactions on the local blockchain.
    walletAddress: { type: String, required: true },
    // Index of the deterministic development wallet assigned to this user.
    // The backend derives the signing key from it; it is never sent to the client.
    walletIndex: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

/** Hash a plaintext password with bcrypt. */
userSchema.statics.hashPassword = function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, config.bcryptRounds);
};

/** Compare a login attempt against the stored bcrypt hash. */
userSchema.methods.verifyPassword = function verifyPassword(plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

/** Shape returned by the API - note that passwordHash is deliberately absent. */
userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    walletAddress: this.walletAddress,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model("User", userSchema);
