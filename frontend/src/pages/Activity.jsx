import { useEffect, useState } from "react";
import { api } from "../services/api";
import {
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  StatusBadge,
  Table,
  Td,
  formatAction,
  formatDate,
  inputClass
} from "../components/ui";

const FILTERS = [
  ["all", "All"],
  ["success", "Successful"],
  ["denied", "Denied"],
  ["failure", "Failed"]
];

export default function Activity() {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .get("/activity?limit=200")
      .then((data) => setActivity(data.activity))
      .catch(() => setActivity([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = activity.filter((entry) => {
    if (filter !== "all" && entry.status !== filter) return false;
    if (!query) return true;
    const haystack = `${entry.action} ${entry.details} ${entry.fileName || ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <>
      <PageHeader
        title="Activity"
        description="A record of every security-relevant action on your account."
      />

      <Card
        title={`${filtered.length} entr${filtered.length === 1 ? "y" : "ies"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${inputClass} max-w-48`}
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex rounded-lg border border-slate-700 p-0.5">
              {FILTERS.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`rounded-md px-2.5 py-1 text-xs transition ${
                    filter === value
                      ? "bg-slate-700 text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {loading ? (
          <LoadingState label="Loading activity" />
        ) : filtered.length ? (
          <Table columns={["Action", "File", "Detail", "Status", "When"]}>
            {filtered.map((entry) => (
              <tr key={entry.id} className="transition hover:bg-slate-800/30">
                <Td className="whitespace-nowrap font-medium text-slate-200">
                  {formatAction(entry.action)}
                </Td>
                <Td className="text-slate-400">{entry.fileName || "—"}</Td>
                <Td className="text-slate-400">{entry.details}</Td>
                <Td>
                  <StatusBadge status={entry.status} />
                </Td>
                <Td className="whitespace-nowrap text-slate-500">{formatDate(entry.timestamp)}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState title="No matching activity" description="Try a different filter or search." />
        )}
      </Card>
    </>
  );
}
