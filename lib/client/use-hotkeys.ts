"use client";

import { useEffect, useRef } from "react";

/**
 * Station shortcuts (Space, arrows, Enter, lowercase letters). Held keys
 * do not repeat, and typing in a form field or a scanner's capitals never
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
      // Letters match exactly: "s" is a shortcut, "S" is text. A barcode
      // scanner types labels like "S0066-1" in capitals (with or without
      // reporting Shift), so it never triggers a lowercase shortcut.
      const handler = ref.current[e.key];
      if (!handler) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
