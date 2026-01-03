"use client";

import { createContext, useContext, ReactNode } from "react";

export interface PaneContextValue {
  paneId: string;
  activeTabId: string | null;
}

const PaneContext = createContext<PaneContextValue | null>(null);

export function PaneProvider({
  paneId,
  activeTabId,
  children,
}: {
  paneId: string;
  activeTabId: string | null;
  children: ReactNode;
}) {
  return (
    <PaneContext.Provider value={{ paneId, activeTabId }}>
      {children}
    </PaneContext.Provider>
  );
}

export function usePaneContext(): PaneContextValue {
  const context = useContext(PaneContext);
  if (!context) {
    throw new Error("usePaneContext must be used within PaneProvider");
  }
  return context;
}

export function usePaneContextSafe(): PaneContextValue | null {
  return useContext(PaneContext);
}
