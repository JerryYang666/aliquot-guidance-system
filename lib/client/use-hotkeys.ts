"use client";

import { useEffect, useRef } from "react";

/**
 * Station shortcuts (Space, arrows, Enter, letters). Held keys do not
 * repeat, and typing in a form field or a scanner's shifted capitals never
 * triggers them.
 */
export function useHotkeys(
  bindings: Record<string, (() => void) | undefined>,
  enabled = true,
) {
  const ref = useRef(bindings);
  useEffect(() => {
    ref.current = bindings;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing || e.metaKey || e.ctrlKey || e.altKey)
        return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable=true], dialog",
        )
      )
        return;
      // A barcode scanner types labels like "S0066-1" with Shift held for
      // capitals; letter shortcuts are plain keys, so shifted ones are text.
      if (e.shiftKey && e.key.length === 1 && e.key !== " ") return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const handler = ref.current[key];
      if (!handler) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
