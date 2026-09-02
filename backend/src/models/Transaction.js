const mongoose = require("mongoose");

/**
 * Local mirror of the blockchain transactions this application created.
 *
 * The chain itself remains the source of truth - this collection only makes the
 * "Blockchain Activity" page fast to render, and it is never used to decide
 * whether a file is authentic. Nothing here can change what is on-chain.
 */
const transactionSchema = new mongoose.Schema(
  {
    txHash: { type: String, required: true, unique: true, index: true },
    action: { type: String, enum: ["addFile", "grantAccess", "revokeAccess"], required: true },
    fileId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    fromAddress: { type: String, default: "" },
    contractAddress: { type: String, default: "" },
    blockNumber: { type: Number, default: null },
    gasUsed: { type: String, default: null },
    status: { type: String, enum: ["confirmed", "failed"], default: "confirmed" },
    durationMs: { type: Number, default: null },
    timestamp: { type: Date, default: Date.now, index: true }
  },
  { versionKey: false }
);

module.exports = mongoose.model("Transaction", transactionSchema);
