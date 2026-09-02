/**
 * Small shared presentation components: cards, buttons, tables, badges,
 * modals, spinners and the hash display used across the application.
 */
import { useEffect } from "react";

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export function Card({ title, subtitle, actions, children, className = "" }) {
  return (
    <section
      className={`rounded-xl border border-slate-800 bg-slate-900/60 shadow-sm ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, accent = "cyan" }) {
  const accents = {
    cyan: "text-cyan-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    violet: "text-violet-300",
    rose: "text-rose-300"
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${accents[accent]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const BUTTON_VARIANTS = {
  primary: "bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:bg-cyan-500/40",
  secondary:
    "border border-slate-700 bg-slate-800/60 text-slate-200 hover:border-slate-600 hover:bg-slate-800",
  danger: "border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20",
  ghost: "text-slate-300 hover:bg-slate-800/70"
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  children,
  className = "",
  ...props
}) {
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm" };
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_VARIANTS[variant]} ${sizes[size]} ${className}`}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function Spinner({ size = "md" }) {
  const sizes = { sm: "h-3.5 w-3.5 border-2", md: "h-5 w-5 border-2", lg: "h-8 w-8 border-[3px]" };
  return (
    <span
      className={`inline-block animate-spin rounded-full border-current border-t-transparent ${sizes[size]}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function LoadingState({ label = "Loading" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <Spinner size="lg" />
      <p className="text-sm">{label}...</p>
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-800 py-14 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {description && <p className="max-w-sm text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Alert({ type = "info", title, children }) {
  const styles = {
    info: "border-sky-500/30 bg-sky-500/5 text-sky-200",
    success: "border-emerald-500/30 bg-emerald-500/5 text-emerald-200",
    warning: "border-amber-500/30 bg-amber-500/5 text-amber-200",
    error: "border-rose-500/30 bg-rose-500/5 text-rose-200"
  };
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles[type]}`}>
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <div className="text-[13px] leading-relaxed opacity-90">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export function Badge({ tone = "slate", children }) {
  const tones = {
    slate: "border-slate-700 bg-slate-800/70 text-slate-300",
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    rose: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    cyan: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
    violet: "border-violet-500/40 bg-violet-500/10 text-violet-300"
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Green/red/grey badge summarising the last integrity check on a file. */
export function IntegrityBadge({ result }) {
  if (result === "verified") return <Badge tone="emerald">✓ Verified</Badge>;
  if (result === "failed") return <Badge tone="rose">✕ Failed</Badge>;
  return <Badge tone="slate">Not checked</Badge>;
}

export function StatusBadge({ status }) {
  const map = {
    success: ["emerald", "Success"],
    confirmed: ["emerald", "Confirmed"],
    failure: ["rose", "Failed"],
    failed: ["rose", "Failed"],
    denied: ["amber", "Denied"]
  };
  const [tone, label] = map[status] || ["slate", status];
  return <Badge tone={tone}>{label}</Badge>;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export function Table({ columns, children }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800">
            {columns.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }) {
  return <td className={`px-3 py-3 align-middle text-slate-300 ${className}`}>{children}</td>;
}

// ---------------------------------------------------------------------------
// Hash / CID display
// ---------------------------------------------------------------------------

/**
 * Long hex values are shown truncated with a copy button. The full value is in
 * the title attribute so it can be inspected during a demonstration.
 */
export function HashValue({ value, label, tone = "slate", full = false }) {
  if (!value) return <span className="text-xs text-slate-600">—</span>;

  const tones = {
    slate: "text-slate-300",
    emerald: "text-emerald-300",
    rose: "text-rose-300",
    cyan: "text-cyan-300"
  };
  const shown = full || value.length <= 24 ? value : `${value.slice(0, 10)}…${value.slice(-8)}`;

  return (
    <span className="inline-flex items-center gap-1.5">
      {label && <span className="text-[11px] text-slate-500">{label}</span>}
      <code
        title={value}
        className={`mono rounded bg-slate-950/70 px-1.5 py-0.5 text-xs ${full ? "break-all" : "whitespace-nowrap"} ${tones[tone]}`}
      >
        {shown}
      </code>
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(value)}
        className="text-[11px] text-slate-500 transition hover:text-slate-300"
        title="Copy to clipboard"
      >
        copy
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Modal and confirmation dialog
// ---------------------------------------------------------------------------

export function Modal({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-500 transition hover:text-slate-200"
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", onConfirm, onCancel, busy }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-300">{message}</p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none transition focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatAction(action) {
  const map = {
    REGISTER: "Account created",
    LOGIN: "Signed in",
    LOGOUT: "Signed out",
    UPLOAD: "File uploaded",
    DOWNLOAD: "File downloaded",
    VERIFY: "Integrity verified",
    VIEW_FILE: "File viewed",
    GRANT_ACCESS: "Access granted",
    REVOKE_ACCESS: "Access revoked",
    TAMPER_TEST: "Tamper test",
    RESTORE: "Content restored"
  };
  return map[action] || action;
}
