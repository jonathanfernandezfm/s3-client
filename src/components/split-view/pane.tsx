"use client";

import { useLayoutStore } from "@/lib/stores/layout-store";
import { useBrowserStore } from "@/lib/stores/browser-store";
import { PaneProvider } from "@/lib/contexts/pane-context";
import { PaneHeader } from "./pane-header";
import { TabBar } from "@/components/tabs/tab-bar";
import { TabContent } from "@/components/tabs/tab-content";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

interface PaneProps {
  paneId: string;
  isLastColumn?: boolean;
}

export function Pane({ paneId, isLastColumn = true }: PaneProps) {
  const { panes, focusedPaneId, setFocusedPane } = useLayoutStore();
  const { initPaneState, removePaneState } = useBrowserStore();

  const pane = panes[paneId];
  const isFocused = focusedPaneId === paneId;
  const hasMultiplePanes = Object.keys(panes).length > 1;

  // Initialize browser state for this pane
  useEffect(() => {
    initPaneState(paneId);
    return () => {
      removePaneState(paneId);
    };
  }, [paneId, initPaneState, removePaneState]);

  if (!pane) return null;

  const handleClick = () => {
    if (!isFocused) {
      setFocusedPane(paneId);
    }
  };

  return (
    <PaneProvider paneId={paneId} activeTabId={pane.activeTabId}>
      <div
        className={cn(
          "flex flex-col h-full overflow-hidden",
          hasMultiplePanes && !isLastColumn && "border-r border-border"
        )}
        onClick={handleClick}
      >
        {hasMultiplePanes && <PaneHeader paneId={paneId} />}
        <TabBar paneId={paneId} />
        <div className="flex-1 p-6 overflow-auto">
          <TabContent paneId={paneId} />
        </div>
      </div>
    </PaneProvider>
  );
}
