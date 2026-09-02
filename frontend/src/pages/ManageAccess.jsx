import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/api";
import { useToast } from "../context/ToastContext";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  HashValue,
  LoadingState,
  PageHeader,
  Table,
  Td,
  formatDate,
  inputClass
} from "../components/ui";

/**
 * Access management for one file.
 *
 * Granting and revoking both send a transaction to the smart contract first.
 * Only when that transaction is confirmed is the application database updated,
 * so the two records cannot drift apart.
 */
export default function ManageAccess() {
  const { id } = useParams();
  const toast = useToast();

  const [file, setFile] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [loading, setLoading] = useState(true);
  const [granting, setGranting] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [lastTx, setLastTx] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [detail, perms, allUsers] = await Promise.all([
        api.get(`/files/${id}`),
        api.get(`/files/${id}/permissions`),
        api.get("/users")
      ]);
      setFile(detail.file);
      setPermissions(perms.permissions);
      setUsers(allUsers.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const grantedIds = new Set(permissions.map((p) => p.userId));
  const availableUsers = users.filter((u) => !grantedIds.has(u.id));

  const handleGrant = async (event) => {
    event.preventDefault();
    if (!selectedUser) return;

    setGranting(true);
    try {
      const result = await api.post(`/files/${id}/grant`, { userId: selectedUser });
      setLastTx({ action: "Access granted", ...result.transaction });
      toast(result.message, "success");
      setSelectedUser("");
      await load();
    } catch (err) {
      toast(err.message || "Access could not be granted.", "error");
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      const result = await api.del(`/files/${id}/revoke/${revokeTarget.userId}`);
      setLastTx({ action: "Access revoked", ...result.transaction });
      toast(result.message, "success");
      setRevokeTarget(null);
      await load();
    } catch (err) {
      toast(err.message || "Access could not be revoked.", "error");
    } finally {
      setRevoking(false);
    }
  };

  if (loading) return <LoadingState label="Loading permissions" />;

  if (error) {
    return (
      <>
        <PageHeader title="Manage access" />
        <Alert type="error" title="Unable to manage access">
          {error}
        </Alert>
        <div className="mt-4">
          <Link to="/files">
            <Button variant="secondary" size="sm">
              Back to my files
            </Button>
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Manage access"
        description={file?.fileName}
        actions={
          <Link to={`/files/${id}`}>
            <Button variant="secondary" size="sm">
              File details
            </Button>
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card
          title="Authorised users"
          subtitle="Each entry corresponds to a permission recorded in the smart contract"
        >
          {permissions.length ? (
            <Table columns={["User", "Wallet address", "Granted", "Transaction", ""]}>
              {permissions.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <p className="font-medium text-slate-100">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.email}</p>
                  </Td>
                  <Td>
                    <HashValue value={p.walletAddress} />
                  </Td>
                  <Td className="whitespace-nowrap text-slate-500">{formatDate(p.grantedAt)}</Td>
                  <Td>
                    <HashValue value={p.txHash} />
                  </Td>
                  <Td>
                    <Button variant="danger" size="sm" onClick={() => setRevokeTarget(p)}>
                      Revoke
                    </Button>
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState
              title="No one else has access"
              description="Only you can read this file. Grant access below to share it."
            />
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Grant access">
            <form onSubmit={handleGrant} className="flex flex-col gap-4">
              <label>
                <span className="mb-1.5 block text-xs font-medium text-slate-300">Select user</span>
                <select
                  className={inputClass}
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  disabled={!availableUsers.length}
                >
                  <option value="">
                    {availableUsers.length ? "Choose a registered user" : "No other users available"}
                  </option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {u.email}
                    </option>
                  ))}
                </select>
              </label>

              <Button type="submit" loading={granting} disabled={!selectedUser}>
                Grant access
              </Button>

              <p className="text-[11px] leading-relaxed text-slate-500">
                A transaction is sent from your wallet address to the contract. Only the file owner
                can send it, and the contract rejects it from anyone else.
              </p>
            </form>
          </Card>

          {lastTx && (
            <Card title="Last transaction">
              <dl className="flex flex-col gap-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Action</dt>
                  <dd className="text-slate-200">{lastTx.action}</dd>
                </div>
                <div>
                  <dt className="mb-1 text-xs text-slate-500">Transaction hash</dt>
                  <dd>
                    <HashValue value={lastTx.txHash} />
                  </dd>
                </div>
                <div className="flex gap-6">
                  <div>
                    <dt className="text-xs text-slate-500">Block</dt>
                    <dd className="mono text-xs text-slate-300">{lastTx.blockNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Gas used</dt>
                    <dd className="mono text-xs text-slate-300">{lastTx.gasUsed}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Confirmed in</dt>
                    <dd className="mono text-xs text-slate-300">{lastTx.durationMs} ms</dd>
                  </div>
                </div>
              </dl>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title="Revoke access"
        message={`Remove ${revokeTarget?.email}'s access to this file? A revocation transaction will be sent to the smart contract, and they will no longer be able to download it.`}
        confirmLabel="Revoke access"
        busy={revoking}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
      />
    </>
  );
}
