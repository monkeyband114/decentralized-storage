/** Small toast notification system used for success and error feedback. */
import { createContext, useCallback, useContext, useState } from "react";

const ToastContext = createContext(null);

const STYLES = {
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  error: "border-rose-500/40 bg-rose-500/10 text-rose-200",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-200"
};

const ICONS = { success: "✓", error: "✕", info: "i", warning: "!" };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message, type = "info", timeout = 5000) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, message, type }]);
      setTimeout(() => dismiss(id), timeout);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${STYLES[t.type]}`}
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-bold">
              {ICONS[t.type]}
            </span>
            <p className="flex-1 leading-snug">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-current opacity-60 transition hover:opacity-100"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context.toast;
}
