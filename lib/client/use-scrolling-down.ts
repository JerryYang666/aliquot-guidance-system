"use client";

import { useEffect, useState } from "react";

// Smaller movements are a finger resting, not a scroll.
const THRESHOLD_PX = 8;

/**
 * True while the page is being scrolled down, and false again as soon as it
 * is scrolled back up or is within `clearance` pixels of its top. A top bar
 * uses it to get out of the way on a small screen and to come back the
 * moment it is reached for.
 */
export function useScrollingDown(clearance: number): boolean {
  const [down, setDown] = useState(false);

  useEffect(() => {
    // Phones overscroll past both ends and bounce back; only positions the
    // page can rest at count.
    const position = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return Math.min(Math.max(window.scrollY, 0), Math.max(max, 0));
    };
    let last = position();
    const onScroll = () => {
      const y = position();
      if (y >= clearance && Math.abs(y - last) < THRESHOLD_PX) return;
      setDown(y >= clearance && y > last);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [clearance]);

  return down;
}
