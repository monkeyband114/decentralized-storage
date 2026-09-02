import { useEffect, useState } from "react";
import { api } from "../../services/api";
import {
  Badge,
  Card,
  HashValue,
  LoadingState,
  PageHeader,
  Table,
  Td,
  formatDate,
  inputClass
} from "../../components/ui";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .get("/admin/users")
      .then((data) => setUsers(data.users))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter((u) =>
    `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <PageHeader
        title="Users"
        description="Registered accounts and the wallet address assigned to each."
      />

      <Card
        title={`${filtered.length} user${filtered.length === 1 ? "" : "s"}`}
        actions={
          <input
            className={`${inputClass} max-w-56`}
            placeholder="Search users"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
      >
        {loading ? (
          <LoadingState label="Loading users" />
        ) : (
          <Table columns={["Name", "Email", "Role", "Wallet address", "Files", "Registered"]}>
            {filtered.map((user) => (
              <tr key={user.id} className="transition hover:bg-slate-800/30">
                <Td className="font-medium text-slate-100">{user.name}</Td>
                <Td className="text-slate-400">{user.email}</Td>
                <Td>
                  <Badge tone={user.role === "admin" ? "violet" : "slate"}>{user.role}</Badge>
                </Td>
                <Td>
                  <HashValue value={user.walletAddress} />
                </Td>
                <Td className="mono text-slate-300">{user.fileCount}</Td>
                <Td className="whitespace-nowrap text-slate-500">{formatDate(user.createdAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Password hashes are never returned by the API, and this view provides no route to a user's
        file content.
      </p>
    </>
  );
}
