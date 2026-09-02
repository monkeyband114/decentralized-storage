import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { Badge, Card, HashValue, PageHeader, StatCard, formatDate } from "../components/ui";

const SECURITY_NOTES = [
  ["Password storage", "Your password is stored only as a bcrypt hash, with a unique salt."],
  ["Session", "Requests are authenticated with a signed JWT that expires automatically."],
  ["File encryption", "Files are encrypted with AES-256-GCM before they reach IPFS."],
  ["Integrity", "Every retrieval re-hashes the file and compares it with the on-chain record."],
  ["Access control", "Permissions are held in the smart contract and checked on the server."]
];

export default function Profile() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api
      .get("/dashboard")
      .then((data) => setStats(data.statistics))
      .catch(() => setStats(null));
  }, []);

  return (
    <>
      <PageHeader title="Profile" description="Your account and the security applied to it." />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card title="Account">
          <div className="mb-5 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xl font-semibold text-cyan-300">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-base font-semibold text-slate-100">{user?.name}</p>
              <p className="text-sm text-slate-400">{user?.email}</p>
              <span className="mt-1 inline-block">
                <Badge tone={user?.role === "admin" ? "violet" : "slate"}>{user?.role}</Badge>
              </span>
            </div>
          </div>

          <dl className="flex flex-col gap-4 border-t border-slate-800 pt-4">
            <div>
              <dt className="mb-1 text-xs text-slate-500">Wallet address</dt>
              <dd>
                <HashValue value={user?.walletAddress} tone="cyan" full />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Member since</dt>
              <dd className="mt-1 text-sm text-slate-300">{formatDate(user?.createdAt)}</dd>
            </div>
          </dl>

          <p className="mt-4 border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
            This address signs your transactions on the local development network. It holds test
            funds only and has no value.
          </p>
        </Card>

        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Files" value={stats?.files ?? "—"} accent="cyan" />
            <StatCard label="Shared out" value={stats?.filesShared ?? "—"} accent="violet" />
            <StatCard label="Shared with me" value={stats?.sharedWithMe ?? "—"} accent="emerald" />
          </div>

          <Card title="How your data is protected">
            <ul className="flex flex-col gap-3">
              {SECURITY_NOTES.map(([title, description]) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">{title}</p>
                    <p className="text-xs leading-relaxed text-slate-500">{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
