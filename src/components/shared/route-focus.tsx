"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Next.js App Router does not move focus on client-side navigation. After each
 * route change, move keyboard focus to the main landmark so screen-reader and
 * keyboard users land at the start of the new page's content.
 */
export function RouteFocus() {
  const pathname = usePathname();
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main) main.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}
