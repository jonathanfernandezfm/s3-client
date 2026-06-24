"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

function readSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeSystemTheme(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

export function useTheme() {
  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    readSystemTheme,
    () => "light" as const
  );
  const [themeOverride, setThemeOverride] = useState<"light" | "dark" | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem("theme");
    return stored === "light" || stored === "dark" ? stored : null;
  });
  const theme = themeOverride ?? systemTheme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setTheme = (next: "light" | "dark") => {
    setThemeOverride(next);
    localStorage.setItem("theme", next);
  };

  return { theme, setTheme };
}
