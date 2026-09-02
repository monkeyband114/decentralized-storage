const mongoose = require("mongoose");

/**
 * One access grant: user X may read file Y.
 *
 * This mirrors the permission stored in the smart contract. The contract is the
 * authoritative record; this collection exists so the API can list and display
 * permissions quickly without scanning the chain.
 */
const permissionSchema = new mongoose.Schema(
  {
    fileId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["active", "revoked"], default: "active" },
    txHash: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

// A user has at most one permission row per file (it flips between active/revoked).
permissionSchema.index({ fileId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("Permission", permissionSchema);
