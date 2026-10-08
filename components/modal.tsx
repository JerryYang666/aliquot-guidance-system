"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/** A centered dialog; Escape or the backdrop closes it. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  headerAction,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Shown at the top right, beside the close button. */
  headerAction?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
      />
      <dialog
        open
        aria-modal="true"
        className="relative m-0 flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white p-0 shadow-xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {headerAction}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
            >
              <X className="size-5" />
            </button>
          </div>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
            {footer}
          </footer>
        )}
      </dialog>
    </div>
  );
}
