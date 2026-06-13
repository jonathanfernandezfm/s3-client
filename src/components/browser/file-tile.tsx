"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Folder, FileImage, FileText, File, Loader2, MessageSquare, Link2,
  MoreVertical, Download, Trash2, Eye, Star, History, SlidersHorizontal, Tag, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useFileItemBehavior } from "./use-file-item-behavior";
import type { S3Object } from "@/types";
import { ShareDialog } from "@/components/shares/share-dialog";
import { useBucketVersioning } from "@/lib/queries/buckets";
import { useVersionHistoryDialogStore } from "@/lib/stores/version-history-dialog-store";
import { useInfoDrawerStore } from "@/lib/stores/info-drawer-store";
import { usePropertiesDrawerStore } from "@/lib/stores/properties-drawer-store";
import { useBookmarksForBucket, useCreateBookmark, useDeleteBookmark } from "@/lib/queries/bookmarks";
import { findBookmark } from "@/lib/bookmarks-helpers";
import { useTier } from "@/hooks/use-tier";
import { useUpgradeModalStore } from "@/lib/stores/upgrade-modal-store";
import { CapabilityGate } from "@/components/health/capability-gate";
import { TagChips } from "./tag-chips";
import { TagEditorDialog } from "./tag-editor-dialog";

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
  onSelect: (mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onPreview: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
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
  shareCount?: number;
  tags?: string[];
  activeTag?: string | null;
  onTagClick?: (tag: string) => void;
}

export function FileTile({
  object,
  connectionId,
  bucket,
  currentPath,
  canWrite = true,
  isSelected,
  onSelect,
  onPreview,
  onDelete,
  onDownload,
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
  shareCount = 0,
  tags = [],
  activeTag,
  onTagClick,
}: FileTileProps) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const { can } = useTier();
  const openUpgradeModal = useUpgradeModalStore((s) => s.open);
  const prefixBookmarks = useBookmarksForBucket(connectionId, bucket);
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const versioning = useBucketVersioning(connectionId, bucket);
  const hasVersioning = versioning.data?.status === "Enabled" || versioning.data?.status === "Suspended";
  const openVersionDialog = useVersionHistoryDialogStore((s) => s.open);
  const setInfoScope = useInfoDrawerStore((s) => s.setScope);
  const openInfoDrawer = useInfoDrawerStore((s) => s.open);
  const openPropertiesDrawer = usePropertiesDrawerStore((s) => s.open);

  const handleOpenProperties = () => {
    openPropertiesDrawer({ connectionId, bucket, objectKey: object.key });
  };

  const handleOpenActivity = () => {
    setInfoScope({
      connectionId,
      bucket,
      prefix: currentPath || undefined,
      objectKey: object.key,
    });
    openInfoDrawer("activity");
  };

  const handleOpenVersions = () => {
    setInfoScope({
      connectionId,
      bucket,
      prefix: currentPath || undefined,
      objectKey: object.key,
    });
    openInfoDrawer("versions");
  };

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
        onClickCapture={(e) => {
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            onSelect({ shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
          }
        }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          onClick={(e) => {
            e.stopPropagation();
            onSelect({ shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
          }}
          data-selected={isSelected}
          className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 data-[selected=true]:opacity-100 z-10"
        />
        <Link
          href={`/app/browser/${connectionId}/${bucket}/${object.key}`}
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
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {(() => {
            const existing = findBookmark(prefixBookmarks, connectionId, bucket, object.key);
            const pinned = !!existing;
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 bg-background/80 backdrop-blur-sm border shadow-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => {
                    if (pinned && existing) deleteBookmark.mutate(existing.id);
                    else createBookmark.mutate({ connectionId, bucket, prefix: object.key });
                  }}>
                    <Star className="h-4 w-4" />
                    {pinned ? "Unpin folder" : "Pin folder"}
                  </DropdownMenuItem>
                  {canWrite && (
                    <CapabilityGate connectionId={connectionId} bucket={bucket} capability="delete-objects" disableOnly>
                      <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </CapabilityGate>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })()}
        </div>
        <div className="mt-2 flex items-center gap-1 min-w-0">
          <span className="text-sm truncate" title={fileName}>{fileName}</span>
          {noteCount > 0 && (
            <span
              className="shrink-0 inline-flex items-center gap-0.5 text-xs text-muted-foreground"
              title={`${noteCount} note${noteCount === 1 ? "" : "s"}`}
            >
              <MessageSquare className="h-3 w-3" />
              {noteCount}
            </span>
          )}
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
      onClickCapture={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          onSelect({ shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
        }
      }}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => {}}
        onClick={(e) => {
          e.stopPropagation();
          onSelect({ shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
        }}
        data-selected={isSelected}
        className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 data-[selected=true]:opacity-100 z-10"
      />
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
      {!object.isFolder && (
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 bg-background/80 backdrop-blur-sm border shadow-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onPreview}>
                <Eye className="h-4 w-4" />
                Preview
              </DropdownMenuItem>
              <CapabilityGate connectionId={connectionId} bucket={bucket} capability="object-tagging" disableOnly>
                <DropdownMenuItem onClick={() => setTagsOpen(true)}>
                  <Tag className="h-4 w-4" />
                  Tags...
                </DropdownMenuItem>
              </CapabilityGate>
              <CapabilityGate connectionId={connectionId} bucket={bucket} capability="download-objects" disableOnly>
                <DropdownMenuItem onClick={onDownload}>
                  <Download className="h-4 w-4" />
                  Download
                </DropdownMenuItem>
              </CapabilityGate>
              <DropdownMenuItem
                onClick={() => can("shareLinks") ? setShareOpen(true) : openUpgradeModal()}
              >
                <Link2 className="h-4 w-4" />
                Share...
                {!can("shareLinks") && (
                  <span className="ml-auto rounded-full border border-blue-500/30 bg-blue-500/20 px-1 text-[8px] font-medium text-blue-400">
                    PRO
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenProperties}>
                <SlidersHorizontal className="h-4 w-4" />
                Properties
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenActivity}>
                <Activity className="h-4 w-4" />
                Activity
              </DropdownMenuItem>
              {hasVersioning && (
                <DropdownMenuItem onClick={handleOpenVersions}>
                  <History className="h-4 w-4" />
                  Versions
                </DropdownMenuItem>
              )}
              {hasVersioning && (
                <DropdownMenuItem
                  onClick={() => openVersionDialog({ connectionId, bucket, key: object.key })}
                >
                  <History className="h-3.5 w-3.5" />
                  History
                </DropdownMenuItem>
              )}
              {canWrite && (
                <CapabilityGate connectionId={connectionId} bucket={bucket} capability="delete-objects" disableOnly>
                  <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </CapabilityGate>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <div className="mt-2 flex items-center gap-1 min-w-0">
        <span className="text-sm truncate" title={fileName}>{fileName}</span>
        {shareCount > 0 && (
          <span
            className="shrink-0 inline-flex items-center gap-0.5 text-xs text-muted-foreground"
            title={`${shareCount} active share link${shareCount === 1 ? "" : "s"}`}
          >
            <Link2 className="h-3 w-3" />
            {shareCount}
          </span>
        )}
        {tags.length > 0 && (
          <TagChips tags={tags} max={2} activeTag={activeTag} onTagClick={onTagClick} />
        )}
      </div>
      {shareOpen && !object.isFolder && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          connectionId={connectionId}
          bucket={bucket}
          fileKey={object.key}
        />
      )}
      {tagsOpen && !object.isFolder && (
        <TagEditorDialog
          open={tagsOpen}
          onClose={() => setTagsOpen(false)}
          connectionId={connectionId}
          bucket={bucket}
          objectKey={object.key}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}
