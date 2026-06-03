"use client";

import { useEffect } from "react";

export function usePaneKeyboard({
  containerRef,
  onSelectAll,
  onClearSelection,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  onSelectAll: () => void;
  onClearSelection: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const active = document.activeElement;
      const inEditable =
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable);
      if (inEditable) return;

      const focusInside =
        active === container ||
        (active instanceof Node && container.contains(active));
      if (!focusInside) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        onSelectAll();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClearSelection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [containerRef, onSelectAll, onClearSelection]);
}
