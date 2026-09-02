/**
 * Decentralized storage layer (IPFS).
 *
 * WHY IPFS?
 * IPFS is content-addressed: the identifier of a file (its CID) is derived from
 * the file's own bytes. You cannot change the content and keep the same CID.
 * That property, combined with the SHA-256 hash we record on the blockchain,
 * is what gives the system tamper-evidence.
 *
 * WHAT GETS STORED
 * Only the ENCRYPTED file is uploaded. IPFS is a public network, so plaintext
 * must never leave this server.
 *
 * TWO PROVIDERS
 *  - "kubo"   : a local IPFS daemon, used during development.
 *  - "pinata" : a hosted pinning service, used when the API is deployed. A
 *               hosting platform runs no daemon of its own, and its filesystem
 *               is not persistent, so the content has to be pinned elsewhere.
 * Both speak IPFS and return real CIDs; only the transport differs.
 *
 * DEVELOPMENT FALLBACK
 * If the kubo daemon is unreachable, the service falls back to a local
 * content-addressed store on disk so the workflow can still be demonstrated. It
 * computes a genuine CIDv1 (raw codec + SHA-256, base32) over the same bytes.
 * Note: a real IPFS node splits files larger than 256 KB into a DAG of chunks,
 * so for such files the fallback CID differs from the CID a daemon would
 * return. Run the daemon for a faithful demonstration. The fallback is disabled
 * automatically when IPFS_ALLOW_LOCAL_FALLBACK is false, which is what a
 * deployed instance should use.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config/env");
const logger = require("../utils/logger");

const API = config.ipfsApiUrl.replace(/\/$/, "");
const PINATA_API = "https://api.pinata.cloud";
const REQUEST_TIMEOUT_MS = 30000;

// --------------------------------------------------------------------------
// CID helpers (used by the local fallback store)
// --------------------------------------------------------------------------
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** RFC 4648 base32, lowercase, no padding - the encoding CIDv1 uses. */
function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Build a CIDv1 for a buffer: version 1, raw codec (0x55),
 * multihash = sha2-256 (0x12) with length 32 (0x20).
 * The leading "b" is the multibase prefix meaning "base32".
 */
function computeCidV1(buffer) {
  const digest = crypto.createHash("sha256").update(buffer).digest();
  const cidBytes = Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), digest]);
  return "b" + base32Encode(cidBytes);
}

// --------------------------------------------------------------------------
// Provider availability
// --------------------------------------------------------------------------
let daemonAvailable = null; // null = not checked yet

const usingPinata = () => config.ipfsProvider === "pinata";

async function checkDaemon(force = false) {
  if (usingPinata()) return true;
  if (daemonAvailable !== null && !force) return daemonAvailable;
  try {
    const res = await fetch(`${API}/api/v0/version`, {
      method: "POST",
      signal: AbortSignal.timeout(4000)
    });
    daemonAvailable = res.ok;
  } catch (err) {
    daemonAvailable = false;
  }
  return daemonAvailable;
}

/** Confirm the Pinata credentials work. */
async function checkPinata() {
  try {
    const res = await fetch(`${PINATA_API}/data/testAuthentication`, {
      headers: { Authorization: `Bearer ${config.pinataJwt}` },
      signal: AbortSignal.timeout(8000)
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

async function getStatus() {
  if (usingPinata()) {
    const online = await checkPinata();
    return {
      online,
      provider: "pinata",
      backend: "ipfs",
      apiUrl: PINATA_API,
      gatewayUrl: config.pinataGateway,
      version: online ? "Pinata pinning service" : null
    };
  }

  const online = await checkDaemon(true);
  let version = null;
  if (online) {
    try {
      const res = await fetch(`${API}/api/v0/version`, { method: "POST" });
      version = (await res.json()).Version;
    } catch (err) {
      version = null;
    }
  }
  return {
    online,
    provider: "kubo",
    backend: online ? "ipfs" : "local",
    apiUrl: API,
    gatewayUrl: config.ipfsGatewayUrl,
    version
  };
}

// --------------------------------------------------------------------------
// Local fallback store
// --------------------------------------------------------------------------
function localStorePath(cid) {
  fs.mkdirSync(config.ipfsLocalStoreDir, { recursive: true });
  return path.join(config.ipfsLocalStoreDir, `${cid}.bin`);
}

function localAdd(buffer) {
  const cid = computeCidV1(buffer);
  fs.writeFileSync(localStorePath(cid), buffer);
  return cid;
}

function localCat(cid) {
  const file = localStorePath(cid);
  if (!fs.existsSync(file)) {
    throw new Error(`Content ${cid} not found in the local content-addressed store`);
  }
  return fs.readFileSync(file);
}

// --------------------------------------------------------------------------
// Pinata transport
// --------------------------------------------------------------------------
async function pinataAdd(encryptedBuffer, fileName) {
  const form = new FormData();
  form.append("file", new Blob([encryptedBuffer]), fileName);
  // Ask for CIDv1 so identifiers match the format used elsewhere in the system.
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const res = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.pinataJwt}` },
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!res.ok) {
    throw new Error(`Pinata upload failed with HTTP ${res.status}: ${await res.text()}`);
  }

  const parsed = await res.json();
  if (!parsed.IpfsHash) throw new Error("Pinata returned no CID");
  return parsed.IpfsHash;
}

async function pinataCat(cid) {
  const res = await fetch(`${config.pinataGateway}/ipfs/${encodeURIComponent(cid)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`IPFS gateway fetch failed with HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Upload an encrypted buffer and return its CID.
 * @returns {Promise<{cid: string, backend: "ipfs"|"local", durationMs: number}>}
 */
async function uploadBuffer(encryptedBuffer, fileName = "encrypted.bin") {
  const startedAt = Date.now();

  if (usingPinata()) {
    const cid = await pinataAdd(encryptedBuffer, fileName);
    return { cid, backend: "ipfs", durationMs: Date.now() - startedAt };
  }

  if (await checkDaemon()) {
    try {
      const form = new FormData();
      form.append("file", new Blob([encryptedBuffer]), fileName);

      // cid-version=1 keeps CIDs in the modern base32 form.
      const res = await fetch(`${API}/api/v0/add?cid-version=1&pin=true&wrap-with-directory=false`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });

      if (!res.ok) throw new Error(`IPFS add failed with HTTP ${res.status}`);

      // The add endpoint streams newline-delimited JSON; the last line is the file.
      const text = (await res.text()).trim();
      const lastLine = text.split("\n").filter(Boolean).pop();
      const parsed = JSON.parse(lastLine);
      if (!parsed.Hash) throw new Error("IPFS add returned no CID");

      return { cid: parsed.Hash, backend: "ipfs", durationMs: Date.now() - startedAt };
    } catch (err) {
      logger.warn(`IPFS daemon upload failed: ${err.message}`);
      daemonAvailable = false;
      if (!config.ipfsAllowLocalFallback) throw err;
    }
  }

  if (!config.ipfsAllowLocalFallback) {
    throw new Error("No IPFS node reachable and the local fallback store is disabled");
  }

  const cid = localAdd(encryptedBuffer);
  return { cid, backend: "local", durationMs: Date.now() - startedAt };
}

/**
 * Fetch the encrypted bytes stored at a CID.
 * @returns {Promise<{buffer: Buffer, backend: string, durationMs: number}>}
 */
async function fetchByCid(cid, backendHint = "ipfs") {
  const startedAt = Date.now();

  if (usingPinata()) {
    const buffer = await pinataCat(cid);
    return { buffer, backend: "ipfs", durationMs: Date.now() - startedAt };
  }

  if (backendHint === "ipfs" && (await checkDaemon())) {
    try {
      const res = await fetch(`${API}/api/v0/cat?arg=${encodeURIComponent(cid)}`, {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (!res.ok) throw new Error(`IPFS cat failed with HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      return { buffer, backend: "ipfs", durationMs: Date.now() - startedAt };
    } catch (err) {
      logger.warn(`IPFS daemon fetch failed for ${cid}: ${err.message}`);
      if (!config.ipfsAllowLocalFallback) throw err;
    }
  }

  if (!config.ipfsAllowLocalFallback) {
    throw new Error(`Unable to retrieve ${cid} from IPFS`);
  }

  const buffer = localCat(cid);
  return { buffer, backend: "local", durationMs: Date.now() - startedAt };
}

module.exports = {
  uploadBuffer,
  fetchByCid,
  getStatus,
  computeCidV1
};
