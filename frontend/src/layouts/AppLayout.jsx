/**
 * Application shell: sidebar navigation, a top bar showing live IPFS and
 * blockchain status, and the routed page content.
 */
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { Button } from "../components/ui";

const USER_LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: "▦" },
  { to: "/files", label: "My Files", icon: "🗀" },
  { to: "/upload", label: "Upload File", icon: "↑" },
  { to: "/shared", label: "Shared With Me", icon: "⇄" },
  { to: "/verify", label: "Verify Integrity", icon: "✓" },
  { to: "/blockchain", label: "Blockchain", icon: "⛓" },
  { to: "/activity", label: "Activity", icon: "≡" },
  { to: "/profile", label: "Profile", icon: "◍" }
];

const ADMIN_LINKS = [
  { to: "/admin", label: "Admin Dashboard", icon: "▤" },
  { to: "/admin/users", label: "Users", icon: "◎" },
  { to: "/admin/activity", label: "System Activity", icon: "≡" },
  { to: "/admin/transactions", label: "Transactions", icon: "⛓" }
];

function StatusDot({ ok }) {
  return (
    <span
      className={`pulse-dot inline-block h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-rose-400"}`}
    />
  );
}

export default function AppLayout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Poll the health of the two external systems so the operator can see at a
  // glance whether IPFS and the chain are reachable.
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await api.get("/blockchain/status");
        if (active) setStatus(data);
      } catch {
        if (active) setStatus(null);
      }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
      isActive
        ? "bg-cyan-500/10 font-medium text-cyan-300"
        : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
    }`;

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 shrink-0 border-r border-slate-800 bg-slate-900/70 backdrop-blur transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-800 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
            ⛨
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-100">SecureChain</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Storage</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          {USER_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={linkClass}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="w-4 text-center text-slate-500">{link.icon}</span>
              {link.label}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <p className="mt-4 px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                Administration
              </p>
              {ADMIN_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === "/admin"}
                  className={linkClass}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="w-4 text-center text-slate-500">{link.icon}</span>
                  {link.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Live system status */}
        <div className="mx-3 mt-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            System status
          </p>
          <div className="flex items-center justify-between py-0.5 text-xs">
            <span className="text-slate-400">IPFS node</span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <StatusDot ok={status?.ipfs?.online} />
              {status?.ipfs?.online ? "Online" : "Offline"}
            </span>
          </div>
          <div className="flex items-center justify-between py-0.5 text-xs">
            <span className="text-slate-400">Blockchain</span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <StatusDot ok={status?.blockchain?.connected} />
              {status?.blockchain?.connected ? `Block ${status.blockchain.blockNumber}` : "Offline"}
            </span>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-slate-950/70 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/85 px-5 backdrop-blur">
          <button
            className="text-slate-400 lg:hidden"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            ☰
          </button>

          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-200">{user?.name}</p>
              <p className="mono text-[10px] text-slate-500" title={user?.walletAddress}>
                {user?.walletAddress?.slice(0, 8)}…{user?.walletAddress?.slice(-6)}
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-sm font-semibold text-cyan-300">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </header>

        <main className="flex-1 p-5 lg:p-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
