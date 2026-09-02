const mongoose = require("mongoose");

/**
 * Metadata for one uploaded file.
 *
 * The file CONTENT is not here and not on the blockchain - it lives on IPFS in
 * encrypted form. This collection holds the application-level metadata plus the
 * two references that make the content verifiable:
 *   - sha256Hash : fingerprint of the ORIGINAL file
 *   - ipfsCid    : address of the ENCRYPTED file on IPFS
 */
const fileSchema = new mongoose.Schema(
  {
    // Public identifier, also used as the key inside the smart contract.
    fileId: { type: String, required: true, unique: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ownerWallet: { type: String, required: true },

    fileName: { type: String, required: true },
    description: { type: String, default: "", maxlength: 500 },
    mimeType: { type: String, default: "application/octet-stream" },
    fileSize: { type: Number, required: true },

    // SHA-256 of the original plaintext file - the integrity reference.
    sha256Hash: { type: String, required: true },
    // IPFS Content Identifier of the encrypted file.
    ipfsCid: { type: String, required: true },
    // Where the encrypted bytes actually went: the IPFS daemon, or the local
    // content-addressed store used when no daemon is reachable.
    storageBackend: { type: String, enum: ["ipfs", "local"], default: "ipfs" },

    // "private"  - only the owner and users the owner explicitly authorises
    // "restricted" - same enforcement, but signals the file is meant to be shared
    accessLevel: { type: String, enum: ["private", "restricted"], default: "private" },

    // Transaction that recorded this file on the blockchain.
    blockchainTxHash: { type: String, default: null },
    blockchainBlockNumber: { type: Number, default: null },

    // Set by the tamper-simulation endpoint so the UI can show that the stored
    // content no longer matches the hash recorded on-chain.
    tampered: { type: Boolean, default: false },
    originalCid: { type: String, default: null },
    originalSha256Hash: { type: String, default: null },

    lastVerifiedAt: { type: Date, default: null },
    lastVerificationResult: { type: String, enum: ["verified", "failed", null], default: null },

    createdAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

module.exports = mongoose.model("File", fileSchema);
