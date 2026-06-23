"use client";

import { useRef, useState, useEffect } from "react";
import { useLayoutStore, Tab } from "@/lib/stores/layout-store";
import { Button } from "@/components/ui/button";
import { X, Plus, FolderOpen, Database, PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDragContextSafe } from "@/lib/contexts/drag-context";

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  paneId: string;
}

const DRAG_HOVER_DELAY_MS = 1000;

function TabItem({ tab, isActive, paneId }: TabItemProps) {
  const { setActiveTab, removeTab, panes } = useLayoutStore();
  const dragCtx = useDragContextSafe();

  const pane = panes[paneId];
  const tabCount = pane?.tabs.length || 0;
  const paneCount = Object.keys(panes).length;

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragEnterCountRef = useRef(0);
  const [isDragHovered, setIsDragHovered] = useState(false);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const clearDragHover = () => {
    dragEnterCountRef.current = 0;
    setIsDragHovered(false);
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const handleDragEnter = () => {
    if (!dragCtx?.isDragging || isActive) return;
    dragEnterCountRef.current++;
    if (dragEnterCountRef.current === 1) {
      setIsDragHovered(true);
      hoverTimerRef.current = setTimeout(() => {
        setActiveTab(paneId, tab.id);
        clearDragHover();
      }, DRAG_HOVER_DELAY_MS);
    }
  };

  const handleDragLeave = () => {
    if (!dragCtx?.isDragging) return;
    dragEnterCountRef.current = Math.max(0, dragEnterCountRef.current - 1);
    if (dragEnterCountRef.current === 0) {
      clearDragHover();
    }
  };

  const getTabLabel = () => {
    if (tab.type === "buckets") {
      return "Buckets";
    }
    if (tab.bucket) {
      const pathDisplay = tab.path ? `/${tab.path.replace(/\/$/, "")}` : "";
      return `${tab.bucket}${pathDisplay}`;
    }
    return "Browser";
  };

  const getTabIcon = () => {
    if (tab.type === "buckets") {
      return <Database className="h-3.5 w-3.5" />;
    }
    return <FolderOpen className="h-3.5 w-3.5" />;
  };

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-all min-w-0 max-w-[350px] rounded-t-lg mx-0.5 mt-2",
        isActive
          ? "bg-background shadow-sm border border-b-0 border-border"
          : "bg-muted/40 hover:bg-muted/70 border border-b-0 border-transparent",
        isDragHovered && "ring-2 ring-primary/60 ring-inset bg-primary/10"
      )}
      onClick={() => setActiveTab(paneId, tab.id)}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onAuxClick={(e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        e.stopPropagation();
        removeTab(paneId, tab.id);
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      {isActive && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
      )}
      <span className="text-muted-foreground shrink-0">{getTabIcon()}</span>
      <span className="text-sm truncate flex-1" title={getTabLabel()}>
        {getTabLabel()}
      </span>
      {(tabCount > 1 || paneCount > 1) && (
        <button
          className={cn(
            "p-1 rounded-md hover:bg-accent transition-opacity shrink-0",
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
          onClick={(e) => {
            e.stopPropagation();
            removeTab(paneId, tab.id);
          }}
          aria-label={`Close tab ${getTabLabel()}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

interface TabBarProps {
  paneId: string;
}

export function TabBar({ paneId }: TabBarProps) {
  const { panes, grid, focusedPaneId, addTab, addPane, removePane, setFocusedPane } = useLayoutStore();
  const pane = panes[paneId];

  if (!pane) return null;

  const isFocused = focusedPaneId === paneId;
  const hasMultiplePanes = Object.keys(panes).length > 1;
  const canSplitRight = grid.columns < 3;

  const handleAddTab = () => {
    addTab(paneId, { type: "buckets", path: "" });
  };

  const handleSplitRight = () => {
    setFocusedPane(paneId);
    addPane("right");
  };

  const handleClosePane = () => {
    removePane(paneId);
  };

  return (
    <div
      className={cn(
        "flex items-center border-b px-2",
        isFocused && hasMultiplePanes ? "bg-primary/5" : "bg-muted/20"
      )}
    >
      {/* Tabs */}
      <div className="flex items-end overflow-x-auto flex-1">
        {pane.tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === pane.activeTabId}
            paneId={paneId}
          />
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 mt-2 mb-0.5 ml-1 rounded-lg"
          onClick={handleAddTab}
          title="New tab"
          aria-label="New tab"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-1 ml-2 self-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleSplitRight}
          disabled={!canSplitRight}
          title="Split right"
          aria-label="Split pane right"
        >
          <PanelRight className="h-4 w-4" />
        </Button>
        {hasMultiplePanes && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
            onClick={handleClosePane}
            title="Close pane"
            aria-label="Close pane"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
