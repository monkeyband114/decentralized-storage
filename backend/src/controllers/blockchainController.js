/**
 * Read-only views of what this application has written to the blockchain.
 */
const Transaction = require("../models/Transaction");
const blockchainService = require("../services/blockchainService");
const ipfsService = require("../services/ipfsService");

/**
 * GET /api/blockchain/transactions
 * Regular users see the transactions relating to their own files; an
 * administrator sees every transaction.
 */
async function listTransactions(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const filter = req.user.role === "admin" ? {} : { userId: req.user._id };

    const transactions = await Transaction.find(filter)
      .populate("userId", "name email")
      .sort({ timestamp: -1 })
      .limit(limit);

    res.json({
      success: true,
      transactions: transactions.map((t) => ({
        txHash: t.txHash,
        action: t.action,
        fileId: t.fileId,
        user: t.userId ? { name: t.userId.name, email: t.userId.email } : null,
        fromAddress: t.fromAddress,
        contractAddress: t.contractAddress,
        blockNumber: t.blockNumber,
        gasUsed: t.gasUsed,
        status: t.status,
        durationMs: t.durationMs,
        timestamp: t.timestamp
      }))
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/blockchain/status - network, contract and IPFS health for the UI. */
async function status(req, res, next) {
  try {
    const [chain, ipfs] = await Promise.all([
      blockchainService.getStatus(),
      ipfsService.getStatus()
    ]);
    res.json({ success: true, blockchain: chain, ipfs });
  } catch (err) {
    next(err);
  }
}

/** GET /api/blockchain/files/:fileId - the raw on-chain record for one file. */
async function onChainRecord(req, res, next) {
  try {
    const record = await blockchainService.getFile(req.params.fileId);
    res.json({ success: true, record });
  } catch (err) {
    next(err);
  }
}

module.exports = { listTransactions, status, onChainRecord };
