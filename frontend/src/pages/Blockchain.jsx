import { useEffect, useState } from "react";
import { api } from "../services/api";
import {
  Badge,
  Card,
  EmptyState,
  HashValue,
  LoadingState,
  PageHeader,
  StatCard,
  StatusBadge,
  Table,
  Td,
  formatDate
} from "../components/ui";

const ACTION_LABELS = {
  addFile: ["File uploaded", "cyan"],
  grantAccess: ["Access granted", "emerald"],
  revokeAccess: ["Access revoked", "amber"]
};

export default function Blockchain() {
  const [transactions, setTransactions] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/blockchain/transactions"), api.get("/blockchain/status")])
      .then(([tx, st]) => {
        setTransactions(tx.transactions);
        setStatus(st);
      })
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Loading blockchain activity" />;

  return (
    <>
      <PageHeader
        title="Blockchain activity"
        description="Every transaction this application has written to the smart contract."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Network"
          value={status?.blockchain?.connected ? "Connected" : "Offline"}
          accent={status?.blockchain?.connected ? "emerald" : "rose"}
          hint={status?.blockchain?.rpcUrl}
        />
        <StatCard
          label="Chain ID"
          value={status?.blockchain?.chainId ?? "—"}
          accent="cyan"
          hint="Local development network"
        />
        <StatCard
          label="Current block"
          value={status?.blockchain?.blockNumber ?? "—"}
          accent="violet"
        />
        <StatCard label="Transactions" value={transactions.length} accent="amber" hint="Recorded by you" />
      </div>

      {status?.blockchain?.contractAddress && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm">
          <span className="text-xs text-slate-500">Contract address</span>
          <HashValue value={status.blockchain.contractAddress} tone="cyan" full />
          <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            IPFS
            <Badge tone={status?.ipfs?.online ? "emerald" : "rose"}>
              {status?.ipfs?.online ? `kubo ${status.ipfs.version}` : "offline"}
            </Badge>
          </span>
        </div>
      )}

      <Card title="Transactions" subtitle="Newest first">
        {transactions.length ? (
          <Table columns={["Action", "Transaction hash", "File", "Block", "Gas", "Time", "Status"]}>
            {transactions.map((tx) => {
              const [label, tone] = ACTION_LABELS[tx.action] || [tx.action, "slate"];
              return (
                <tr key={tx.txHash} className="transition hover:bg-slate-800/30">
                  <Td>
                    <Badge tone={tone}>{label}</Badge>
                  </Td>
                  <Td>
                    <HashValue value={tx.txHash} />
                  </Td>
                  <Td>
                    <code className="mono text-xs text-slate-400">{tx.fileId}</code>
                  </Td>
                  <Td className="mono text-slate-300">{tx.blockNumber}</Td>
                  <Td className="mono text-slate-400">{tx.gasUsed}</Td>
                  <Td className="whitespace-nowrap text-slate-500">{formatDate(tx.timestamp)}</Td>
                  <Td>
                    <StatusBadge status={tx.status} />
                  </Td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <EmptyState
            title="No transactions yet"
            description="Uploading a file or granting access writes a transaction to the contract."
          />
        )}
      </Card>
    </>
  );
}
