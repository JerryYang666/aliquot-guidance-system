"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { cx } from "./ui";

type ToastTone = "info" | "warning" | "error" | "success";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(
  () => {},
);

let nextId = 1;

// How long each kind stays up. A warning, such as a tube going to another
// batch's box, is read at a glance and must not linger over the next one.
const TOAST_MS: Record<ToastTone, number> = {
  info: 3500,
  success: 3500,
  warning: 4000,
  error: 6000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      TOAST_MS[tone],
    );
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      {/* Warnings show at the top: on a phone, the bottom of the screen
          is where a station's latest scan result is, and a warning about
          a tube must not cover where that tube goes. */}
      {(["top", "bottom"] as const).map((edge) => (
        <div
          key={edge}
          aria-live="polite"
          className={cx(
            "pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4",
            edge === "top" ? "top-4" : "bottom-4",
          )}
        >
          {toasts
            .filter((t) => (t.tone === "warning") === (edge === "top"))
            .map((t) => (
              <div
                key={t.id}
                className={cx(
                  "max-w-lg rounded-xl px-4 py-3 font-medium shadow-lg",
                  t.tone === "warning" ? "text-base" : "text-sm",
                  t.tone === "error" && "bg-red-600 text-white",
                  t.tone === "success" && "bg-emerald-600 text-white",
                  t.tone === "warning" && "bg-amber-400 text-slate-900",
                  t.tone === "info" && "bg-slate-900 text-white",
                )}
              >
                {t.message}
              </div>
            ))}
        </div>
      ))}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
