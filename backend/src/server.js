/**
 * Entry point: connect to MongoDB, report the state of IPFS and the
 * blockchain, then start listening.
 */
const app = require("./app");
const config = require("./config/env");
const logger = require("./utils/logger");
const { connectDatabase } = require("./config/db");
const ipfsService = require("./services/ipfsService");
const blockchainService = require("./services/blockchainService");

async function start() {
  try {
    await connectDatabase();

    // Report the state of the two external systems at startup so problems are
    // obvious immediately rather than during the first upload.
    const ipfsStatus = await ipfsService.getStatus();
    if (ipfsStatus.online) {
      logger.info("IPFS node reachable at " + ipfsStatus.apiUrl + " (kubo " + ipfsStatus.version + ")");
    } else {
      logger.warn(
        "No IPFS node at " + ipfsStatus.apiUrl + ". Falling back to the local content-addressed store."
      );
    }

    const chainStatus = await blockchainService.getStatus();
    if (chainStatus.connected && chainStatus.contractDeployed) {
      logger.info(
        "Blockchain connected: chainId " +
          chainStatus.chainId +
          ", contract " +
          chainStatus.contractAddress
      );
    } else if (chainStatus.connected) {
      logger.warn("Blockchain reachable but no contract deployment found. Run the deploy script.");
    } else {
      logger.warn("No blockchain node at " + chainStatus.rpcUrl + ". Uploads will be refused.");
    }

    app.listen(config.port, () => {
      logger.info("API listening on http://localhost:" + config.port + " (" + config.nodeEnv + ")");
    });
  } catch (err) {
    logger.error("Failed to start the server: " + err.message);
    process.exit(1);
  }
}

start();
