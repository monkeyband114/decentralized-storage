import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import {
  Alert,
  Card,
  HashValue,
  LoadingState,
  PageHeader,
  StatCard,
  StatusBadge,
  Table,
  Td,
  formatAction,
  formatBytes,
  formatDate
} from "../../components/ui";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/admin/statistics"),
      api.get("/admin/activity?limit=10"),
      api.get("/blockchain/status")
    ])
      .then(([s, a, st]) => {
        setStats(s.statistics);
        setActivity(a.activity);
        setStatus(st);
      })
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Loading system overview" />;

  return (
    <>
      <PageHeader
        title="Administration"
        description="System-wide statistics, users and audit records."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total users" value={stats?.totalUsers ?? 0} accent="cyan" />
        <StatCard
          label="Total files"
          value={stats?.totalFiles ?? 0}
          accent="violet"
          hint={formatBytes(stats?.totalStorageBytes ?? 0)}
        />
        <StatCard label="Access grants" value={stats?.totalAccessGrants ?? 0} accent="emerald" />
        <StatCard label="Transactions" value={stats?.totalTransactions ?? 0} accent="amber" />
        <StatCard
          label="Integrity checks"
          value={stats?.integrityVerificationAttempts ?? 0}
          accent="cyan"
          hint={`${stats?.failedVerifications ?? 0} failed`}
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card title="Network">
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Blockchain</dt>
              <dd className={status?.blockchain?.connected ? "text-emerald-300" : "text-rose-300"}>
                {status?.blockchain?.connected ? "Connected" : "Offline"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Chain ID</dt>
              <dd className="mono text-xs text-slate-300">{status?.blockchain?.chainId ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Current block</dt>
              <dd className="mono text-xs text-slate-300">
                {status?.blockchain?.blockNumber ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">IPFS node</dt>
              <dd className={status?.ipfs?.online ? "text-emerald-300" : "text-rose-300"}>
                {status?.ipfs?.online ? `kubo ${status.ipfs.version}` : "Offline"}
              </dd>
            </div>
            <div className="border-t border-slate-800 pt-3">
              <dt className="mb-1 text-xs text-slate-500">Contract</dt>
              <dd>
                <HashValue value={status?.blockchain?.contractAddress} tone="cyan" />
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Security signals" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
              <p className="text-xs text-slate-500">Denied access attempts</p>
              <p className="mt-1 text-2xl font-semibold text-amber-300">
                {stats?.deniedAccessAttempts ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Requests refused by the authorisation check
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
              <p className="text-xs text-slate-500">Failed integrity checks</p>
              <p className="mt-1 text-2xl font-semibold text-rose-300">
                {stats?.failedVerifications ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Files whose content no longer matched their hash
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Alert type="info" title="Administrator scope">
              Administration covers metadata and audit records only. Reading a user's file still
              requires a permission granted by its owner and recorded on the smart contract, and no
              administrative action can alter a blockchain record.
            </Alert>
          </div>
        </Card>
      </div>

      <Card
        title="Recent system activity"
        actions={
          <Link to="/admin/activity" className="text-xs text-cyan-400 hover:text-cyan-300">
            View all
          </Link>
        }
      >
        <Table columns={["User", "Action", "File", "Status", "When"]}>
          {activity.map((entry) => (
            <tr key={entry.id}>
              <Td className="text-slate-300">{entry.user?.name ?? "—"}</Td>
              <Td className="font-medium text-slate-200">{formatAction(entry.action)}</Td>
              <Td className="text-slate-400">{entry.fileName || "—"}</Td>
              <Td>
                <StatusBadge status={entry.status} />
              </Td>
              <Td className="whitespace-nowrap text-slate-500">{formatDate(entry.timestamp)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
