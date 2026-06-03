"use client";

import { useState } from "react";
import Link from "next/link";
import { Folder, FileImage, FileText, File, Loader2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileItemBehavior } from "./use-file-item-behavior";
import { useInfoDrawerStore } from "@/lib/stores/info-drawer-store";
import type { S3Object } from "@/types";

function FileTypeIcon({ filename, className }: { filename: string; className?: string }) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") {
    return <FileText className={cn("text-red-500", className)} />;
  }
  return <File className={cn("text-muted-foreground opacity-50", className)} />;
}

interface FileTileProps {
  object: S3Object;
  connectionId: string;
  bucket: string;
  currentPath: string;
  canWrite?: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onNavigate?: (path: string) => void;
  thumbnailUrl?: string;
  paneId: string;
  allObjects: S3Object[];
  selectedItems: Set<string>;
  onDragStart?: (items: S3Object[]) => void;
  onDragEnd?: () => void;
  onFolderDrop?: (targetFolderKey: string, operation: "copy" | "move") => void;
  isDragging?: boolean;
  canDropOnFolder?: boolean;
  noteCount?: number;
}

export function FileTile({
  object,
  connectionId,
  bucket,
  currentPath,
  isSelected,
  onSelect,
  onPreview,
  onNavigate,
  thumbnailUrl,
  paneId,
  allObjects,
  selectedItems,
  onDragStart,
  onDragEnd,
  onFolderDrop,
  isDragging,
  canDropOnFolder,
  noteCount = 0,
}: FileTileProps) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const { open: openInfoDrawer, setScope: setInfoScope } = useInfoDrawerStore();

  function openNotes(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setInfoScope({ connectionId, bucket, objectKey: object.key });
    openInfoDrawer("notes");
  }

  const { dragHandlers, folderDropHandlers, isFolderDragOver, isBeingDragged, fileName } =
    useFileItemBehavior({
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
    });

  if (object.isFolder) {
    return (
      <div
        className={cn(
          "group relative",
          isBeingDragged && isDragging && "opacity-50"
        )}
        draggable
        onDragStart={dragHandlers.onDragStart}
        onDragEnd={dragHandlers.onDragEnd}
        {...(folderDropHandlers ?? {})}
        style={{ cursor: "grab" }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          data-selected={isSelected}
          className="absolute top-2 left-2 h-4 w-4 rounded border-gray-300 opacity-0 group-hover:opacity-100 data-[selected=true]:opacity-100 z-10"
        />
        <button
          type="button"
          onClick={openNotes}
          title={noteCount > 0 ? `${noteCount} note${noteCount === 1 ? "" : "s"} — click to view` : "Add a note"}
          className={cn(
            "absolute top-2 right-2 z-10 inline-flex items-center gap-0.5 text-xs bg-background/90 backdrop-blur-sm rounded px-1.5 py-0.5 border border-border text-foreground transition-opacity",
            noteCount > 0
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          )}
        >
          <MessageSquare className="h-3 w-3" />
          {noteCount > 0 && noteCount}
        </button>
        <Link
          href={`/browser/${connectionId}/${bucket}/${object.key}`}
          onClick={(e) => {
            if (onNavigate) {
              e.preventDefault();
              onNavigate(object.key);
            }
          }}
        >
          <div
            className={cn(
              "aspect-square rounded-md border bg-muted flex items-center justify-center",
              isFolderDragOver && "ring-2 ring-blue-500"
            )}
          >
            <Folder className="h-12 w-12 text-amber-400" />
          </div>
        </Link>
        <div className="mt-2 text-sm truncate" title={fileName}>
          {fileName}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative",
        isBeingDragged && isDragging && "opacity-50"
      )}
      draggable
      onDragStart={dragHandlers.onDragStart}
      onDragEnd={dragHandlers.onDragEnd}
      {...(folderDropHandlers ?? {})}
      style={{ cursor: "grab" }}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onSelect}
        data-selected={isSelected}
        className="absolute top-2 left-2 h-4 w-4 rounded border-gray-300 opacity-0 group-hover:opacity-100 data-[selected=true]:opacity-100 z-10"
      />
      <button
        type="button"
        onClick={openNotes}
        title={noteCount > 0 ? `${noteCount} note${noteCount === 1 ? "" : "s"} — click to view` : "Add a note"}
        className={cn(
          "absolute top-2 right-2 z-10 inline-flex items-center gap-0.5 text-xs bg-background/90 backdrop-blur-sm rounded px-1.5 py-0.5 border border-border text-foreground transition-opacity",
          noteCount > 0
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100"
        )}
      >
        <MessageSquare className="h-3 w-3" />
        {noteCount > 0 && noteCount}
      </button>
      <div
        className="aspect-square rounded-md border bg-muted overflow-hidden relative flex items-center justify-center cursor-pointer"
        onClick={onPreview}
      >
        {thumbnailUrl ? (
          <>
            {!loaded && !broken && (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
            {broken ? (
              <FileImage className="h-12 w-12 opacity-30" />
            ) : (
              <img
                src={thumbnailUrl}
                loading="lazy"
                decoding="async"
                onLoad={() => setLoaded(true)}
                onError={() => setBroken(true)}
                className={`w-full h-full object-cover ${loaded ? "opacity-100" : "opacity-0"}`}
                alt={fileName}
              />
            )}
          </>
        ) : (
          <FileTypeIcon filename={fileName} className="h-12 w-12" />
        )}
      </div>
      <div className="mt-2 text-sm truncate" title={fileName}>
        {fileName}
      </div>
    </div>
  );
}
