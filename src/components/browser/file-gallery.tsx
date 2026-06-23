"use client";

import { useMemo, useRef, useState } from "react";
import { FileTile } from "./file-tile";
import { usePresignedUrls } from "@/lib/queries/presign";
import { useBrowserStore } from "@/lib/stores/browser-store";
import { usePaneSelection } from "./use-pane-selection";
import { usePaneKeyboard } from "./use-pane-keyboard";
import { isImageFile, cn } from "@/lib/utils";
import type { S3Object } from "@/types";

interface FileGalleryProps {
  objects: S3Object[];
  connectionId: string;
  bucket: string;
  currentPath: string;
  canWrite?: boolean;
  isLoading?: boolean;
  onDelete: (key: string) => void;
  onPreview: (object: S3Object) => void;
  onDownload: (key: string) => void;
  onNavigate?: (path: string) => void;
  paneId: string;
  onDrop?: (
    data: {
      sourcePaneId: string;
      connectionId: string;
      bucket: string;
      path: string;
      items: S3Object[];
    },
    operation: "copy" | "move",
    targetFolder?: string
  ) => void;
  isDragging?: boolean;
  isValidDropTarget?: boolean;
  onDragStart?: (items: S3Object[]) => void;
  onDragEnd?: () => void;
  folderNoteCounts?: Record<string, number>;
  fileShareCounts?: Record<string, number>;
  fileTags?: Record<string, string[]>;
  activeTag?: string | null;
  onTagClick?: (tag: string) => void;
}

export function FileGallery({
  objects,
  connectionId,
  bucket,
  currentPath,
  canWrite,
  isLoading,
  onDelete,
  onPreview,
  onDownload,
  onNavigate,
  paneId,
  onDrop,
  isDragging,
  isValidDropTarget,
  onDragStart,
  onDragEnd,
  folderNoteCounts = {},
  fileShareCounts = {},
  fileTags = {},
  activeTag,
  onTagClick,
}: FileGalleryProps) {
  const getPaneState = useBrowserStore((s) => s.getPaneState);
  const paneState = getPaneState(paneId);
  const selectedItems = paneState.selectedItems;
  const [isGalleryDragOver, setIsGalleryDragOver] = useState(false);

  const folderObjects = useMemo(() => objects.filter((o) => o.isFolder), [objects]);
  const imageObjects = useMemo(
    () => objects.filter((o) => !o.isFolder && isImageFile(o.key)),
    [objects]
  );
  const otherObjects = useMemo(
    () => objects.filter((o) => !o.isFolder && !isImageFile(o.key)),
    [objects]
  );

  const imageKeys = useMemo(() => imageObjects.map((o) => o.key), [imageObjects]);
  const thumbnailUrls = usePresignedUrls(connectionId, bucket, imageKeys);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const orderedKeys = useMemo(
    () => [
      ...folderObjects.map((o) => o.key),
      ...imageObjects.map((o) => o.key),
      ...otherObjects.map((o) => o.key),
    ],
    [folderObjects, imageObjects, otherObjects]
  );
  const { handleSelect, selectAllInPane, clearSelectionInPane } =
    usePaneSelection(paneId, orderedKeys);
  usePaneKeyboard({
    containerRef,
    onSelectAll: selectAllInPane,
    onClearSelection: clearSelectionInPane,
  });


  const handleFolderDrop = (targetFolderKey: string, operation: "copy" | "move") => {
    if (!canWrite) return;
    const dragState = useBrowserStore.getState().dragState;
    if (!dragState.isDragging) return;
    onDrop?.(
      {
        sourcePaneId: dragState.sourcePaneId!,
        connectionId: dragState.sourceConnectionId!,
        bucket: dragState.sourceBucket!,
        path: dragState.sourcePath,
        items: dragState.draggedItems,
      },
      operation,
      targetFolderKey
    );
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!isValidDropTarget || !canWrite) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.shiftKey ? "move" : "copy";
    setIsGalleryDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsGalleryDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsGalleryDragOver(false);
    if (!isValidDropTarget || !canWrite) return;
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/x-s3-objects"));
      const operation = e.shiftKey ? "move" : "copy";
      onDrop?.(data, operation);
    } catch {}
  };

  if (objects.length === 0 && !isLoading) {
    return (
      <div
        ref={containerRef}
        tabIndex={0}
        className={cn(
          "flex flex-col items-center justify-center flex-1 min-h-[200px] py-12 text-center transition-colors outline-none",
          isGalleryDragOver && isValidDropTarget && "bg-blue-50 dark:bg-blue-950"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <p className="text-muted-foreground">
          {isGalleryDragOver && isValidDropTarget ? "Drop files here" : "This folder is empty"}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn(
        "flex flex-col flex-1 min-h-[200px] transition-colors outline-none",
        isGalleryDragOver &&
          isValidDropTarget &&
          "ring-2 ring-blue-500 ring-inset bg-blue-50/50 dark:bg-blue-950/50"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-4 p-4">
        {folderObjects.map((object) => (
          <FileTile
            key={object.key}
            object={object}
            connectionId={connectionId}
            bucket={bucket}
            currentPath={currentPath}
            canWrite={canWrite}
            isSelected={selectedItems.has(object.key)}
            onSelect={handleSelect}
            onPreview={onPreview}
            onDelete={onDelete}
            onNavigate={onNavigate}
            paneId={paneId}
            allObjects={objects}
            selectedItems={selectedItems}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onFolderDrop={handleFolderDrop}
            isDragging={isDragging}
            canDropOnFolder={isValidDropTarget && canWrite}
            noteCount={folderNoteCounts[object.key] ?? 0}
          />
        ))}
        {imageObjects.map((object) => (
          <FileTile
            key={object.key}
            object={object}
            connectionId={connectionId}
            bucket={bucket}
            currentPath={currentPath}
            canWrite={canWrite}
            isSelected={selectedItems.has(object.key)}
            onSelect={handleSelect}
            onPreview={onPreview}
            onDelete={onDelete}
            onDownload={onDownload}
            onNavigate={onNavigate}
            thumbnailUrl={thumbnailUrls[object.key]}
            paneId={paneId}
            allObjects={objects}
            selectedItems={selectedItems}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onFolderDrop={handleFolderDrop}
            isDragging={isDragging}
            canDropOnFolder={isValidDropTarget && canWrite}
            shareCount={fileShareCounts[object.key] ?? 0}
            tags={fileTags[object.key] ?? []}
            activeTag={activeTag}
            onTagClick={onTagClick}
          />
        ))}
        {otherObjects.map((object) => (
          <FileTile
            key={object.key}
            object={object}
            connectionId={connectionId}
            bucket={bucket}
            currentPath={currentPath}
            canWrite={canWrite}
            isSelected={selectedItems.has(object.key)}
            onSelect={handleSelect}
            onPreview={onPreview}
            onDelete={onDelete}
            onDownload={onDownload}
            onNavigate={onNavigate}
            paneId={paneId}
            allObjects={objects}
            selectedItems={selectedItems}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onFolderDrop={handleFolderDrop}
            isDragging={isDragging}
            canDropOnFolder={isValidDropTarget && canWrite}
            shareCount={fileShareCounts[object.key] ?? 0}
            tags={fileTags[object.key] ?? []}
            activeTag={activeTag}
            onTagClick={onTagClick}
          />
        ))}
      </div>
    </div>
  );
}
