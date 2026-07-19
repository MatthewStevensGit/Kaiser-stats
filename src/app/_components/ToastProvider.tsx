"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type ToastSeverity = "success" | "error" | "warning" | "info";

interface ToastEntry {
  id: number;
  severity: ToastSeverity;
  message: string;
}

interface ToastContextValue {
  showToast: (severity: ToastSeverity, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 5000;

const ICON_BY_SEVERITY: Record<ToastSeverity, string> = {
  success: "✓",
  error: "✕",
  warning: "▲",
  info: "ℹ",
};

/**
 * App-wide toast/snackbar notifications — mounted once in the root layout so
 * any client component can call useToast() regardless of where it lives in
 * the tree. Colors reuse the same --status-good/-warning/-critical/-info
 * tokens the matchday status dots already use (see globals.css), rather than
 * inventing a new palette.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (severity: ToastSeverity, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, severity, message }]);
      setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.severity}`}>
            <span className="toast-icon" aria-hidden="true">
              {ICON_BY_SEVERITY[t.severity]}
            </span>
            <span className="toast-message">{t.message}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
