import { useEffect, useState } from "react";
import { api } from "../../services/api";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  HashValue,
  LoadingState,
  PageHeader,
  StatusBadge,
  Table,
  Td,
  formatDate
} from "../../components/ui";

const ACTION_LABELS = {
  addFile: ["File uploaded", "cyan"],
  grantAccess: ["Access granted", "emerald"],
  revokeAccess: ["Access revoked", "amber"]
};

export default function AdminTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/blockchain/transactions?limit=200")
      .then((data) => setTransactions(data.transactions))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        title="Blockchain transactions"
        description="Every transaction written to the smart contract, across all accounts."
      />

      <div className="mb-6">
        <Alert type="info" title="Read-only record">
          These entries mirror transactions that are already confirmed on the chain. They cannot be
          edited or removed from this interface, and nothing here can change what the contract holds.
        </Alert>
      </div>

      <Card title={`${transactions.length} transaction${transactions.length === 1 ? "" : "s"}`}>
        {loading ? (
          <LoadingState label="Loading transactions" />
        ) : transactions.length ? (
          <Table
            columns={["Transaction hash", "Action", "File ID", "User", "From", "Block", "Time", "Status"]}
          >
            {transactions.map((tx) => {
              const [label, tone] = ACTION_LABELS[tx.action] || [tx.action, "slate"];
              return (
                <tr key={tx.txHash} className="transition hover:bg-slate-800/30">
                  <Td>
                    <HashValue value={tx.txHash} />
                  </Td>
                  <Td>
                    <Badge tone={tone}>{label}</Badge>
                  </Td>
                  <Td>
                    <code className="mono text-xs text-slate-400">{tx.fileId}</code>
                  </Td>
                  <Td>
                    <p className="text-slate-300">{tx.user?.name ?? "—"}</p>
                    <p className="text-xs text-slate-500">{tx.user?.email ?? ""}</p>
                  </Td>
                  <Td>
                    <HashValue value={tx.fromAddress} />
                  </Td>
                  <Td className="mono text-slate-300">{tx.blockNumber}</Td>
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
            title="No transactions recorded"
            description="Transactions appear once files are uploaded or access is changed."
          />
        )}
      </Card>
    </>
  );
}
