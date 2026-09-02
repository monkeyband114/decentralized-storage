/**
 * Deploys DecentralizedStorage to the local Ethereum network and writes the
 * resulting address + ABI where the backend can read them.
 *
 * Usage:
 *   1. npx hardhat node          (leave running - this is the local blockchain)
 *   2. npm run deploy            (in a second terminal)
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH (test funds only)");

  const Factory = await hre.ethers.getContractFactory("DecentralizedStorage");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("DecentralizedStorage deployed to:", address);

  // Export the address + ABI so the backend (ethers.js) can talk to the contract.
  const artifact = await hre.artifacts.readArtifact("DecentralizedStorage");
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });

  const deployment = {
    network: hre.network.name,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    address,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    abi: artifact.abi
  };

  const outFile = path.join(outDir, "DecentralizedStorage.json");
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log("Deployment details written to:", outFile);

  // Also drop a copy where the backend looks first, so the API is self-contained.
  const backendConfigDir = path.join(__dirname, "..", "..", "backend", "src", "config");
  if (fs.existsSync(backendConfigDir)) {
    const backendFile = path.join(backendConfigDir, "contract.json");
    fs.writeFileSync(backendFile, JSON.stringify(deployment, null, 2));
    console.log("Contract ABI copied for the backend:", backendFile);
  }

  console.log("\nAdd this line to backend/.env (or to the hosting platform's environment):");
  console.log(`CONTRACT_ADDRESS=${address}`);

  if (hre.network.name === "sepolia") {
    console.log(`\nEtherscan: https://sepolia.etherscan.io/address/${address}`);
    console.log(
      "Commit backend/src/config/contract.json so the deployed API has the ABI and address."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
