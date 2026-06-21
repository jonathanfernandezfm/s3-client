"use client";

import { createContext, useContext, ReactNode, useMemo } from "react";
import { useBrowserStore } from "@/lib/stores/browser-store";
import type { S3Object } from "@/types";

interface DragContextValue {
  isDragging: boolean;
  draggedItems: S3Object[];
  sourcePaneId: string | null;
  sourceConnectionId: string | null;
  sourceBucket: string | null;
  sourcePath: string;
  canDropInPane: (
    targetPaneId: string,
    targetConnectionId: string,
    targetBucket: string,
    targetPath: string
  ) => boolean;
  startDrag: (
    paneId: string,
    connectionId: string,
    bucket: string,
    path: string,
    items: S3Object[]
  ) => void;
  endDrag: () => void;
}

const DragContext = createContext<DragContextValue | null>(null);

export function DragProvider({ children }: { children: ReactNode }) {
  const dragState = useBrowserStore((state) => state.dragState);
  const startDrag = useBrowserStore((state) => state.startDrag);
  const endDrag = useBrowserStore((state) => state.endDrag);

  const value = useMemo<DragContextValue>(() => {
    const canDropInPane = (
      targetPaneId: string,
      targetConnectionId: string,
      targetBucket: string,
      targetPath: string
    ): boolean => {
      if (!dragState.isDragging) return false;

      // Can't drop in the same location
      if (
        dragState.sourcePaneId === targetPaneId &&
        dragState.sourceConnectionId === targetConnectionId &&
        dragState.sourceBucket === targetBucket &&
        dragState.sourcePath === targetPath
      ) {
        return false;
      }

      // Check if trying to drop a folder into itself or its descendants
      for (const item of dragState.draggedItems) {
        if (item.isFolder) {
          // Normalize paths for comparison
          const folderPath = item.key.endsWith("/") ? item.key : item.key + "/";
          const normalizedTargetPath = targetPath.endsWith("/") || targetPath === ""
            ? targetPath
            : targetPath + "/";

          // If same connection and bucket, check for recursive drop
          if (
            dragState.sourceConnectionId === targetConnectionId &&
            dragState.sourceBucket === targetBucket &&
            normalizedTargetPath.startsWith(folderPath)
          ) {
            return false;
          }
        }
      }

      return true;
    };

    return {
      isDragging: dragState.isDragging,
      draggedItems: dragState.draggedItems,
      sourcePaneId: dragState.sourcePaneId,
      sourceConnectionId: dragState.sourceConnectionId,
      sourceBucket: dragState.sourceBucket,
      sourcePath: dragState.sourcePath,
      canDropInPane,
      startDrag,
      endDrag,
    };
  }, [dragState, startDrag, endDrag]);

  return <DragContext.Provider value={value}>{children}</DragContext.Provider>;
}

export function useDragContext(): DragContextValue {
  const context = useContext(DragContext);
  if (!context) {
    throw new Error("useDragContext must be used within DragProvider");
  }
  return context;
}

export function useDragContextSafe(): DragContextValue | null {
  return useContext(DragContext);
}
