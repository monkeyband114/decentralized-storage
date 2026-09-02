/**
 * Blockchain layer (Ethereum-compatible local network + Solidity contract).
 *
 * WHAT IT IS FOR
 * The contract holds an append-only record of every file's CID, SHA-256 hash,
 * owner and timestamp, plus the permission list. Because nobody can rewrite a
 * confirmed transaction, that record is an independent reference the
 * application can be checked against - even by someone who does not trust the
 * application's own database.
 *
 * WALLETS
 * Each registered user is assigned a deterministic wallet derived from a single
 * mnemonic, and the backend signs that user's transactions with it. This keeps
 * the contract's onlyOwner check meaningful: a grant transaction really is
 * signed by the file's owner rather than by one shared server account.
 *
 * Locally the mnemonic defaults to the public Hardhat test phrase. For any
 * remote network WALLET_MNEMONIC must be set to a private phrase - a guard
 * below refuses to start otherwise, because the public phrase's keys are known
 * to everyone.
 *
 * LIMITATION: these keys are custodial. The model is acceptable for a test
 * network with valueless ETH; a production system would let each user hold
 * their own key in a wallet such as MetaMask.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const config = require("../config/env");
const logger = require("../utils/logger");
const ApiError = require("../utils/ApiError");

// The phrase user wallets are derived from. The default is the standard
// Hardhat/Ganache development mnemonic - public by design and safe only on a
// local test chain. WALLET_MNEMONIC overrides it for a real deployment.
const PUBLIC_TEST_MNEMONIC = "test test test test test test test test test test test junk";
const MNEMONIC = config.walletMnemonic;

// Gas top-up policy. Local chains hand out valueless ETH freely; on a public
// testnet the faucet supply is limited, so these are configurable.
const MIN_BALANCE = ethers.parseEther(config.walletMinBalanceEth);
const TOP_UP_AMOUNT = ethers.parseEther(config.walletTopUpEth);

/**
 * SECURITY GUARD: the public development mnemonic must never be used against a
 * network anyone else can reach. Its keys are known to the whole world, so any
 * balance sent to those addresses can be swept immediately, and anybody could
 * impersonate a user by signing with them.
 */
function assertSafeMnemonic() {
  const rpc = config.blockchainRpcUrl;
  const isLocal = /^(https?:\/\/)?(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(:\d+)?/i.test(rpc);
  if (MNEMONIC === PUBLIC_TEST_MNEMONIC && !isLocal) {
    throw new Error(
      "Refusing to use the public development mnemonic against a remote network (" +
        rpc +
        "). Set WALLET_MNEMONIC to a private phrase generated for this deployment."
    );
  }
}
assertSafeMnemonic();

let provider = null;
let deployment = null;

/** Locate the ABI + address produced by `npm run deploy` in the blockchain package. */
function loadDeployment() {
  if (deployment) return deployment;

  const candidates = [
    process.env.CONTRACT_DEPLOYMENT_FILE,
    path.join(__dirname, "..", "config", "contract.json"),
    path.join(__dirname, "..", "..", "..", "blockchain", "deployments", "DecentralizedStorage.json")
  ].filter(Boolean);

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      deployment = {
        address: config.contractAddress || parsed.address,
        abi: parsed.abi
      };
      return deployment;
    }
  }
  return null;
}

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(config.blockchainRpcUrl);
  }
  return provider;
}

/**
 * Deterministic development wallet for a user.
 * Index 0 is reserved for the deployer/funder, so users start at index 1.
 */
function walletForIndex(index) {
  const hdPath = "m/44'/60'/0'/0/" + index;
  return ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, hdPath).connect(getProvider());
}

/** Address only - used at registration time, before any transaction is sent. */
function addressForIndex(index) {
  const hdPath = "m/44'/60'/0'/0/" + index;
  return ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, hdPath).address;
}

/** Wallet used to deploy and to fund new user wallets. Defaults to account 0. */
function getFundingWallet() {
  if (config.blockchainPrivateKey) {
    return new ethers.Wallet(config.blockchainPrivateKey, getProvider());
  }
  return walletForIndex(0);
}

/** Contract instance bound to a signer (for writes) or the provider (for reads). */
function getContract(signerOrProvider) {
  const dep = loadDeployment();
  if (!dep || !dep.address) {
    throw new ApiError(
      503,
      "Blockchain transaction could not be completed.",
      "Contract deployment details not found. Deploy the contract first (see README)."
    );
  }
  return new ethers.Contract(dep.address, dep.abi, signerOrProvider || getProvider());
}

/** Give a user wallet enough local test ETH to pay for gas. */
async function ensureFunded(address) {
  const balance = await getProvider().getBalance(address);
  if (balance >= MIN_BALANCE) return;

  const funder = getFundingWallet();
  const tx = await funder.sendTransaction({ to: address, value: TOP_UP_AMOUNT });
  await tx.wait();
  logger.info("Funded wallet " + address + " with " + config.walletTopUpEth + " test ETH");
}

/** Turn any ethers/network failure into the user-facing message from the spec. */
function toBlockchainError(err) {
  logger.error("Blockchain error: " + (err.shortMessage || err.message));
  if (err instanceof ApiError) return err;
  const reason = err.reason || err.shortMessage || err.message;
  return new ApiError(503, "Blockchain transaction could not be completed.", reason);
}

/** Shared receipt -> plain object mapping. */
function describeReceipt(receipt, startedAt, from) {
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed ? receipt.gasUsed.toString() : null,
    from,
    contractAddress: loadDeployment() ? loadDeployment().address : "",
    status: receipt.status === 1 ? "confirmed" : "failed",
    durationMs: Date.now() - startedAt
  };
}

// --------------------------------------------------------------------------
// Write operations (each creates a real transaction on the local chain)
// --------------------------------------------------------------------------

/** Record a new file's metadata on-chain. Signed by the file owner's wallet. */
async function addFile({ fileId, cid, fileHash, walletIndex }) {
  const startedAt = Date.now();
  try {
    const signer = walletForIndex(walletIndex);
    await ensureFunded(signer.address);
    const contract = getContract(signer);
    const tx = await contract.addFile(fileId, cid, fileHash);
    const receipt = await tx.wait(config.txConfirmations);
    return describeReceipt(receipt, startedAt, signer.address);
  } catch (err) {
    throw toBlockchainError(err);
  }
}

/** Authorise another address to read a file. The contract enforces owner-only. */
async function grantAccess({ fileId, granteeAddress, ownerWalletIndex }) {
  const startedAt = Date.now();
  try {
    const signer = walletForIndex(ownerWalletIndex);
    await ensureFunded(signer.address);
    const contract = getContract(signer);
    const tx = await contract.grantAccess(fileId, granteeAddress);
    const receipt = await tx.wait(config.txConfirmations);
    return describeReceipt(receipt, startedAt, signer.address);
  } catch (err) {
    throw toBlockchainError(err);
  }
}

/** Remove a previously granted permission. The contract enforces owner-only. */
async function revokeAccess({ fileId, granteeAddress, ownerWalletIndex }) {
  const startedAt = Date.now();
  try {
    const signer = walletForIndex(ownerWalletIndex);
    await ensureFunded(signer.address);
    const contract = getContract(signer);
    const tx = await contract.revokeAccess(fileId, granteeAddress);
    const receipt = await tx.wait(config.txConfirmations);
    return describeReceipt(receipt, startedAt, signer.address);
  } catch (err) {
    throw toBlockchainError(err);
  }
}

// --------------------------------------------------------------------------
// Read operations (free - they do not create a transaction)
// --------------------------------------------------------------------------

/** Metadata as recorded on-chain. Returns null when the file is not registered. */
async function getFile(fileId) {
  try {
    const contract = getContract();
    const exists = await contract.fileExists(fileId);
    if (!exists) return null;
    const result = await contract.getFile(fileId);
    return {
      fileId: result[0],
      owner: result[1],
      cid: result[2],
      fileHash: result[3],
      timestamp: Number(result[4])
    };
  } catch (err) {
    throw toBlockchainError(err);
  }
}

/** Independent authorisation check read straight from the contract. */
async function hasAccess(fileId, address) {
  try {
    const contract = getContract();
    return await contract.hasAccess(fileId, address);
  } catch (err) {
    throw toBlockchainError(err);
  }
}

/** Connection details shown on the Blockchain page. */
async function getStatus() {
  const dep = loadDeployment();
  try {
    const p = getProvider();
    const network = await p.getNetwork();
    const blockNumber = await p.getBlockNumber();
    return {
      connected: true,
      rpcUrl: config.blockchainRpcUrl,
      chainId: Number(network.chainId),
      blockNumber,
      contractAddress: dep ? dep.address : null,
      contractDeployed: Boolean(dep && dep.address)
    };
  } catch (err) {
    return {
      connected: false,
      rpcUrl: config.blockchainRpcUrl,
      chainId: null,
      blockNumber: null,
      contractAddress: dep ? dep.address : null,
      contractDeployed: Boolean(dep && dep.address)
    };
  }
}

module.exports = {
  addFile,
  grantAccess,
  revokeAccess,
  getFile,
  hasAccess,
  getStatus,
  addressForIndex,
  walletForIndex,
  ensureFunded,
  loadDeployment
};
