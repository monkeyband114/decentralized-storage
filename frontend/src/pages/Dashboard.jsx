import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  Card,
  LoadingState,
  PageHeader,
  StatCard,
  StatusBadge,
  Table,
  Td,
  EmptyState,
  Button,
  formatAction,
  formatDate
} from "../components/ui";

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/dashboard")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Loading dashboard" />;

  const stats = data?.statistics ?? {};

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.name?.split(" ")[0] ?? "there"}`}
        description="Your encrypted files, shared access and integrity history."
        actions={
          <Link to="/upload">
            <Button size="sm">Upload file</Button>
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Files" value={stats.files ?? 0} accent="cyan" hint="Owned by you" />
        <StatCard
          label="Files shared"
          value={stats.filesShared ?? 0}
          accent="violet"
          hint="Active access grants"
        />
        <StatCard
          label="Integrity checks"
          value={stats.integrityChecks ?? 0}
          accent="emerald"
          hint="Hash verifications run"
        />
        <StatCard
          label="Successful downloads"
          value={stats.successfulDownloads ?? 0}
          accent="amber"
          hint="Verified retrievals"
        />
      </div>

      <Card
        title="Recent activity"
        subtitle="Every security-relevant action is recorded"
        actions={
          <Link to="/activity" className="text-xs text-cyan-400 hover:text-cyan-300">
            View all
          </Link>
        }
      >
        {data?.recentActivity?.length ? (
          <Table columns={["Activity", "Detail", "Status", "When"]}>
            {data.recentActivity.map((entry) => (
              <tr key={entry.id}>
                <Td className="font-medium text-slate-200">{formatAction(entry.action)}</Td>
                <Td className="text-slate-400">{entry.details}</Td>
                <Td>
                  <StatusBadge status={entry.status} />
                </Td>
                <Td className="whitespace-nowrap text-slate-500">{formatDate(entry.timestamp)}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState
            title="No activity yet"
            description="Upload your first file to see it recorded here."
            action={
              <Link to="/upload">
                <Button size="sm">Upload a file</Button>
              </Link>
            }
          />
        )}
      </Card>
    </>
  );
}
