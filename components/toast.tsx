"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { cx } from "./ui";

type ToastTone = "info" | "error" | "success";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(
  () => {},
);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      tone === "error" ? 6000 : 3500,
    );
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "max-w-lg rounded-xl px-4 py-3 text-sm font-medium shadow-lg",
              t.tone === "error" && "bg-red-600 text-white",
              t.tone === "success" && "bg-emerald-600 text-white",
              t.tone === "info" && "bg-slate-900 text-white",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
