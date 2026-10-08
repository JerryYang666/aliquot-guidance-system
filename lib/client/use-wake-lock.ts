"use client";

import { useEffect, useState } from "react";

export type WakeLockState = "on" | "off" | "unsupported";

/**
 * Keeps the screen from dimming while a station is open. The lock is
 * released whenever the tab is hidden, so it is re-requested when the tab
 * returns, and on the next touch or key press in browsers (Safari) that only
 * grant it in response to one.
 */
export function useWakeLock(): WakeLockState {
  const [state, setState] = useState<WakeLockState>("off");

  useEffect(() => {
    if (!("wakeLock" in navigator)) {
      const id = setTimeout(() => setState("unsupported"));
      return () => clearTimeout(id);
    }
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;

    const acquire = async () => {
      if (stopped || sentinel || document.visibilityState !== "visible") return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (stopped) {
          await lock.release();
          return;
        }
        sentinel = lock;
        setState("on");
        lock.addEventListener("release", () => {
          sentinel = null;
          setState("off");
        });
      } catch {
        setState("off");
      }
    };

    void acquire();
    const retry = () => void acquire();
    document.addEventListener("visibilitychange", retry);
    window.addEventListener("pointerdown", retry);
    window.addEventListener("keydown", retry);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", retry);
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
      void sentinel?.release();
    };
  }, []);

  return state;
}
