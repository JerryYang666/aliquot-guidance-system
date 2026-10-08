"use client";

import { useEffect, useRef } from "react";

/** Keys from a scanner arrive this close together; a person types slower. */
const MAX_GAP_MS = 60;

/**
 * Accepts labels from a USB or Bluetooth scanner that "types" the code and
 * presses Enter. Ignored while a form field has focus, so the manual entry
 * box still works normally.
 */
export function useKeyboardScanner(onScan: (text: string) => void) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    let buffer = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]"))
        return;
      const now = performance.now();
      if (now - last > MAX_GAP_MS) buffer = "";
      last = now;
      if (e.key === "Enter") {
        if (buffer.length >= 4) {
          e.preventDefault();
          onScanRef.current(buffer);
        }
        buffer = "";
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
