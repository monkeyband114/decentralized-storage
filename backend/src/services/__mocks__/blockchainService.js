/**
 * In-memory stand-in for the blockchain service, used by the automated tests.
 *
 * It reproduces the parts of the contract the API depends on - an append-only
 * record per file and an owner-controlled permission list - so the tests can
 * run without a live Ethereum node. The contract's own behaviour is covered
 * separately by the Hardhat tests in the blockchain package.
 */
const crypto = require("crypto");

const files = new Map(); // fileId -> record
const access = new Map(); // fileId -> Set of addresses

const ADDRESSES = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"
];

let blockNumber = 1;

function randomTxHash() {
  return "0x" + crypto.randomBytes(32).toString("hex");
}

function receipt(from) {
  blockNumber += 1;
  return {
    txHash: randomTxHash(),
    blockNumber,
    gasUsed: "120000",
    from,
    contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    status: "confirmed",
    durationMs: 1
  };
}

function addressForIndex(index) {
  return ADDRESSES[index % ADDRESSES.length];
}

async function addFile({ fileId, cid, fileHash, walletIndex }) {
  const owner = addressForIndex(walletIndex);
  files.set(fileId, { fileId, owner, cid, fileHash, timestamp: Math.floor(Date.now() / 1000) });
  access.set(fileId, new Set([owner]));
  return receipt(owner);
}

async function grantAccess({ fileId, granteeAddress, ownerWalletIndex }) {
  const owner = addressForIndex(ownerWalletIndex);
  const record = files.get(fileId);
  if (!record) throw new Error("File not found");
  if (record.owner !== owner) throw new Error("Not the file owner");
  access.get(fileId).add(granteeAddress);
  return receipt(owner);
}

async function revokeAccess({ fileId, granteeAddress, ownerWalletIndex }) {
  const owner = addressForIndex(ownerWalletIndex);
  const record = files.get(fileId);
  if (!record) throw new Error("File not found");
  if (record.owner !== owner) throw new Error("Not the file owner");
  access.get(fileId).delete(granteeAddress);
  return receipt(owner);
}

async function getFile(fileId) {
  return files.get(fileId) || null;
}

async function hasAccess(fileId, address) {
  const set = access.get(fileId);
  return Boolean(set && set.has(address));
}

async function getStatus() {
  return {
    connected: true,
    rpcUrl: "memory",
    chainId: 31337,
    blockNumber,
    contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    contractDeployed: true
  };
}

/** Test helper: wipe the simulated chain state between suites. */
function __reset() {
  files.clear();
  access.clear();
  blockNumber = 1;
}

module.exports = {
  addFile,
  grantAccess,
  revokeAccess,
  getFile,
  hasAccess,
  getStatus,
  addressForIndex,
  walletForIndex: () => ({ address: ADDRESSES[0] }),
  ensureFunded: async () => {},
  loadDeployment: () => ({ address: "0x5FbDB2315678afecb367f032d93F642f64180aa3", abi: [] }),
  __reset
};
