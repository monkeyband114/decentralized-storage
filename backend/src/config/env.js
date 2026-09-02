/**
 * Central place where every environment variable is read and validated.
 *
 * SECURITY: secrets (JWT signing key, AES encryption key, database URI, wallet
 * mnemonic, IPFS credentials) are never hard-coded in the source. They live in
 * a .env file locally, and in the hosting platform's environment settings when
 * deployed. Neither is committed to version control.
 *
 * The defaults below describe a local development machine, so running the
 * project locally needs almost no configuration. Deployment overrides them.
 */
require("dotenv").config();

const path = require("path");

function required(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return String(raw).toLowerCase() === "true";
}

const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),

  // Database
  mongodbUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/decentralized_storage"),

  // Authentication
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "2h",
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),

  // File encryption (AES-256-GCM). Must be 64 hex characters = 32 bytes = 256 bits.
  encryptionKey: required("ENCRYPTION_KEY"),

  // ------------------------------------------------------------------
  // Decentralized storage
  // "kubo"   - a local IPFS daemon (development default)
  // "pinata" - a hosted IPFS pinning service (used when deployed, because a
  //            hosting platform has no long-running IPFS daemon of its own)
  // ------------------------------------------------------------------
  ipfsProvider: (process.env.IPFS_PROVIDER || "kubo").toLowerCase(),
  ipfsApiUrl: process.env.IPFS_API_URL || "http://127.0.0.1:5001",
  ipfsGatewayUrl: process.env.IPFS_GATEWAY_URL || "http://127.0.0.1:8080",
  ipfsLocalStoreDir:
    process.env.IPFS_LOCAL_STORE_DIR || path.join(__dirname, "..", "..", ".ipfs-local"),
  // Set false on a hosted platform: there is no persistent disk to fall back to.
  ipfsAllowLocalFallback: bool("IPFS_ALLOW_LOCAL_FALLBACK", true),

  pinataJwt: process.env.PINATA_JWT || "",
  pinataGateway: (process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud").replace(/\/$/, ""),

  // ------------------------------------------------------------------
  // Blockchain
  // ------------------------------------------------------------------
  blockchainRpcUrl: process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545",
  contractAddress: process.env.CONTRACT_ADDRESS || "",

  // Mnemonic the per-user signing wallets are derived from.
  // The default is the public Hardhat/Ganache development phrase, which is safe
  // ONLY on a local test chain. A guard in blockchainService refuses to use it
  // against a remote network.
  walletMnemonic:
    process.env.WALLET_MNEMONIC ||
    process.env.DEV_MNEMONIC ||
    "test test test test test test test test test test test junk",

  // Optional explicit key for the account that deploys and funds user wallets.
  // When blank, index 0 of the mnemonic is used.
  blockchainPrivateKey: process.env.BLOCKCHAIN_PRIVATE_KEY || "",

  // Gas top-up policy for user wallets. Local chains hand out valueless ETH
  // freely; on a public testnet the faucet supply is limited, so the amounts
  // are deliberately small and configurable.
  walletMinBalanceEth: process.env.WALLET_MIN_BALANCE_ETH || "0.05",
  walletTopUpEth: process.env.WALLET_TOP_UP_ETH || "1.0",
  // How many confirmations to wait for before treating a transaction as final.
  txConfirmations: Number(process.env.TX_CONFIRMATIONS || 1),

  // Uploads
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 10),

  // ------------------------------------------------------------------
  // CORS. Accepts a comma-separated list so a deployed frontend, its preview
  // deployments and localhost can all be allowed.
  // ------------------------------------------------------------------
  clientUrls: (process.env.CLIENT_URL || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),

  // Enables the owner-only "tamper simulation" endpoint used to prove that
  // integrity verification actually detects modified content.
  allowTamperSimulation: bool("ALLOW_TAMPER_SIMULATION", true)
};

// Fail fast on a badly sized AES key rather than producing broken ciphertext later.
if (!/^[0-9a-fA-F]{64}$/.test(config.encryptionKey)) {
  throw new Error(
    "ENCRYPTION_KEY must be exactly 64 hexadecimal characters (a 256-bit AES key). " +
      'Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
}

// A hosted deployment must use a real pinning service - there is no local daemon.
if (config.ipfsProvider === "pinata" && !config.pinataJwt) {
  throw new Error("IPFS_PROVIDER is set to pinata, but PINATA_JWT is missing.");
}

module.exports = config;
