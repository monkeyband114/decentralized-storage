require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/**
 * Hardhat configuration.
 *
 *   "hardhat"   : in-process network used by `npx hardhat test`
 *   "localhost" : the standalone node started with `npx hardhat node`
 *                 (JSON-RPC on http://127.0.0.1:8545)
 *   "sepolia"   : the public Ethereum test network, used when the system is
 *                 deployed so the contract has an address anyone can inspect
 *                 on Etherscan.
 *
 * Sepolia uses TEST ether obtained from a faucet. It has no monetary value.
 * Never put a mnemonic or private key that controls real funds in this file or
 * in .env.
 */
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

const networks = {
  localhost: {
    url: "http://127.0.0.1:8545",
    chainId: 31337
  }
};

// Only register Sepolia when it has been configured, so the local workflow
// keeps working with no extra setup.
if (SEPOLIA_RPC_URL && DEPLOYER_PRIVATE_KEY) {
  networks.sepolia = {
    url: SEPOLIA_RPC_URL,
    chainId: 11155111,
    accounts: [DEPLOYER_PRIVATE_KEY]
  };
}

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks,
  etherscan: {
    // Optional: lets `npx hardhat verify` publish the source on Etherscan.
    apiKey: process.env.ETHERSCAN_API_KEY || ""
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    artifacts: "./artifacts"
  }
};
