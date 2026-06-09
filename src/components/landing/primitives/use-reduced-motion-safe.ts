"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

// Server snapshot is always "animate": server HTML and the hydration render
// agree, then the real client snapshot takes over without a mismatch.
function getServerSnapshot() {
  return false;
}

/** Hydration-safe prefers-reduced-motion: false during SSR/hydration, live afterwards. */
export function useReducedMotionSafe(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
