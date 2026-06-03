"use client";

import { useRef, useState } from "react";
import { createDragPreview, removeDragPreview } from "./drag-preview";
import { getPreviewKind } from "@/lib/utils";
import type { S3Object } from "@/types";

export function useFileItemBehavior({
  object,
  paneId,
  connectionId,
  bucket,
  currentPath,
  allObjects,
  selectedItems,
  isDragging,
  canDropOnFolder,
  onDragStart,
  onDragEnd,
  onFolderDrop,
}: {
  object: S3Object;
  paneId: string;
  connectionId: string;
  bucket: string;
  currentPath: string;
  allObjects: S3Object[];
  selectedItems: Set<string>;
  isDragging?: boolean;
  canDropOnFolder?: boolean;
  onDragStart?: (items: S3Object[]) => void;
  onDragEnd?: () => void;
  onFolderDrop?: (targetFolderKey: string, operation: "copy" | "move") => void;
}): {
  dragHandlers: {
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  folderDropHandlers:
    | {
        onDragOver: (e: React.DragEvent) => void;
        onDragLeave: (e: React.DragEvent) => void;
        onDrop: (e: React.DragEvent) => void;
      }
    | undefined;
  isFolderDragOver: boolean;
  isBeingDragged: boolean;
  canPreview: boolean;
  fileName: string;
} {
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const [isFolderDragOver, setIsFolderDragOver] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    let itemsToDrag: S3Object[];
    if (selectedItems.has(object.key)) {
      itemsToDrag = allObjects.filter((o) => selectedItems.has(o.key));
    } else {
      itemsToDrag = [object];
    }
    e.dataTransfer.effectAllowed = "copyMove";
    e.dataTransfer.setData(
      "application/x-s3-objects",
      JSON.stringify({
        sourcePaneId: paneId,
        connectionId,
        bucket,
        path: currentPath,
        items: itemsToDrag,
      })
    );
    const preview = createDragPreview(itemsToDrag);
    dragPreviewRef.current = preview;
    e.dataTransfer.setDragImage(preview, 0, 0);
    onDragStart?.(itemsToDrag);
  };

  const handleDragEnd = () => {
    if (dragPreviewRef.current) {
      removeDragPreview(dragPreviewRef.current);
      dragPreviewRef.current = null;
    }
    onDragEnd?.();
  };

  const handleFolderDragOver = (e: React.DragEvent) => {
    if (!object.isFolder || !canDropOnFolder) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.shiftKey ? "move" : "copy";
    setIsFolderDragOver(true);
  };

  const handleFolderDragLeave = (e: React.DragEvent) => {
    if (!object.isFolder) return;
    e.stopPropagation();
    setIsFolderDragOver(false);
  };

  const handleFolderDrop = (e: React.DragEvent) => {
    if (!object.isFolder) return;
    e.preventDefault();
    e.stopPropagation();
    setIsFolderDragOver(false);
    const operation = e.shiftKey ? "move" : "copy";
    onFolderDrop?.(object.key, operation);
  };

  const isBeingDragged =
    !!isDragging && (selectedItems.has(object.key) || selectedItems.size === 0);

  const fileName = (() => {
    const name = object.key.replace(currentPath, "");
    return name.endsWith("/") ? name.slice(0, -1) : name;
  })();

  const canPreview = getPreviewKind(object.key) !== null;

  return {
    dragHandlers: {
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
    },
    folderDropHandlers: object.isFolder
      ? {
          onDragOver: handleFolderDragOver,
          onDragLeave: handleFolderDragLeave,
          onDrop: handleFolderDrop,
        }
      : undefined,
    isFolderDragOver,
    isBeingDragged,
    canPreview,
    fileName,
  };
}
