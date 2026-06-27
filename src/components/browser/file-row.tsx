"use client";

import React, { useState } from "react";
import Link from "next/link";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Folder,
  File,
  FileImage,
  FileText,
  FileCode,
  FileArchive,
  MoreVertical,
  Download,
  Trash2,
  Eye,
  Star,
  MessageSquare,
  Link2,
  Activity,
  History,
  SlidersHorizontal,
  Tag,
  Pencil,
  Copy,
  Link as LinkIcon,
} from "lucide-react";
import { TagChips } from "./tag-chips";
import { TagEditorDialog } from "./tag-editor-dialog";
import { useBucketVersioning } from "@/lib/queries/buckets";
import { useConnection } from "@/lib/queries/connections";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { s3Uri, objectHttpUrl } from "@/lib/s3/uri";
import { useVersionHistoryDialogStore } from "@/lib/stores/version-history-dialog-store";
import { useInfoDrawerStore } from "@/lib/stores/info-drawer-store";
import { usePropertiesDrawerStore } from "@/lib/stores/properties-drawer-store";
import { ShareDialog } from "@/components/shares/share-dialog";
import { RenameDialog } from "./rename-dialog";
import { formatBytes, formatDate, getFileExtension, isImageFile, cn } from "@/lib/utils";
import { useFileItemBehavior } from "./use-file-item-behavior";
import { useBookmarksForBucket, useCreateBookmark, useDeleteBookmark } from "@/lib/queries/bookmarks";
import { findBookmark } from "@/lib/bookmarks-helpers";
import type { S3Object } from "@/types";
import { useTier } from "@/hooks/use-tier";
import { useUpgradeModalStore } from "@/lib/stores/upgrade-modal-store";
import { CapabilityGate } from "@/components/health/capability-gate";

interface FileRowProps {
  object: S3Object;
  connectionId: string;
  bucket: string;
  currentPath: string;
  canWrite?: boolean;
  isSelected: boolean;
  isFocused?: boolean;
  onSelect: (key: string, mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onDelete: (key: string) => void;
  onPreview: (object: S3Object) => void;
  onDownload: (key: string) => void;
  onNavigate?: (path: string) => void;
  // Drag and drop props
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

function getFileIcon(key: string, isFolder: boolean) {
  if (isFolder) return Folder;

  const ext = getFileExtension(key);

  if (isImageFile(key)) return FileImage;
  if (["txt", "md", "json", "xml", "yaml", "yml"].includes(ext)) return FileText;
  if (["js", "ts", "jsx", "tsx", "py", "java", "go", "rs", "c", "cpp", "h"].includes(ext))
    return FileCode;
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) return FileArchive;

  return File;
}

function FileRowImpl({
  object,
  connectionId,
  bucket,
  currentPath,
  canWrite = true,
  isSelected,
  isFocused = false,
  onSelect,
  onDelete,
  onPreview,
  onDownload,
  onNavigate,
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
}: FileRowProps) {
  const Icon = getFileIcon(object.key, object.isFolder);
  const { dragHandlers, folderDropHandlers, isFolderDragOver, isBeingDragged, canPreview, fileName } = useFileItemBehavior({
    object, paneId, connectionId, bucket, currentPath,
    allObjects, selectedItems, isDragging, canDropOnFolder,
    onDragStart, onDragEnd, onFolderDrop,
  });

  const [shareOpen, setShareOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null);
  const { can } = useTier();
  const openUpgradeModal = useUpgradeModalStore((s) => s.open);
  const prefixBookmarks = useBookmarksForBucket(connectionId, bucket);
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const versioning = useBucketVersioning(connectionId, bucket);
  const hasVersioning = versioning.data?.status === "Enabled" || versioning.data?.status === "Suspended";
  const openVersionDialog = useVersionHistoryDialogStore((s) => s.open);
  const connection = useConnection(connectionId);
  const endpoint = connection.data?.endpoint;
  const forcePathStyle = connection.data?.forcePathStyle;
  const setInfoScope = useInfoDrawerStore((s) => s.setScope);
  const openInfoDrawer = useInfoDrawerStore((s) => s.open);
  const openPropertiesDrawer = usePropertiesDrawerStore((s) => s.open);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const handleOpenProperties = () => {
    openPropertiesDrawer({ connectionId, bucket, objectKey: object.key });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    addNotification({ type: "info", title: `${label} copied`, status: "completed" });
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

  const href = object.isFolder
    ? `/app/browser/${connectionId}/${bucket}/${object.key}`
    : undefined;

  const handleFolderClick = (e: React.MouseEvent) => {
    if (onNavigate && object.isFolder) {
      e.preventDefault();
      onNavigate(object.key);
    }
  };

  return (
    <TableRow
      className={cn(
        "group",
        isSelected && "bg-muted",
        isFocused && "ring-2 ring-blue-500 ring-inset",
        isFolderDragOver && object.isFolder && "bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-500 ring-inset"
      )}
      data-state={isSelected ? "selected" : undefined}
      draggable
      {...dragHandlers}
      {...(folderDropHandlers ?? {})}
      style={{ cursor: "grab" }}
      onContextMenu={(e) => { e.preventDefault(); setContextPos({ x: e.clientX, y: e.clientY }); setMenuOpen(true); }}
      onClickCapture={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(object.key, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
        }
      }}
    >
      <TableCell className="w-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(object.key, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
          }}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line react-hooks/static-components -- Icon is a stable imported component reference, not a newly created component; getFileIcon returns Lucide icon, real fix tracked separately */}
          <Icon
            className={`h-4 w-4 ${
              object.isFolder ? "text-amber-400" : "text-muted-foreground"
            }`}
          />
          {href ? (
            <Link href={href} className="hover:underline" onClick={handleFolderClick}>
              {fileName}
            </Link>
          ) : (
            <span
              className={canPreview ? "cursor-pointer hover:underline" : ""}
              onClick={canPreview ? () => onPreview(object) : undefined}
            >
              {fileName}
            </span>
          )}
          {object.isFolder && (() => {
            const existing = findBookmark(prefixBookmarks, connectionId, bucket, object.key);
            const pinned = !!existing;
            return (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (pinned && existing) deleteBookmark.mutate(existing.id);
                  else createBookmark.mutate({ connectionId, bucket, prefix: object.key });
                }}
                className={`p-1 rounded hover:bg-accent ${pinned ? "text-yellow-400" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
                title={pinned ? "Unpin folder" : "Pin folder"}
              >
                <Star className="size-3" fill={pinned ? "currentColor" : "none"} />
              </button>
            );
          })()}
          {object.isFolder && noteCount > 0 && (
            <span
              className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground"
              title={`${noteCount} note${noteCount === 1 ? "" : "s"}`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {noteCount}
            </span>
          )}
          {!object.isFolder && shareCount > 0 && (
            <span
              className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground"
              title={`${shareCount} active share link${shareCount === 1 ? "" : "s"}`}
            >
              <Link2 className="h-3.5 w-3.5" />
              {shareCount}
            </span>
          )}
          {!object.isFolder && tags.length > 0 && (
            <TagChips tags={tags} activeTag={activeTag} onTagClick={onTagClick} />
          )}
        </div>
      </TableCell>
      <TableCell className="w-32 text-muted-foreground">
        {object.isFolder ? "-" : formatBytes(object.size || 0)}
      </TableCell>
      <TableCell className="w-40 text-muted-foreground">
        {object.lastModified ? formatDate(object.lastModified) : "-"}
      </TableCell>
      <TableCell className="w-20">
        <div className="flex items-center gap-1">
          {!object.isFolder && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); handleOpenProperties(); }}
              title="Properties"
              aria-label="File properties"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          )}
          <DropdownMenu open={menuOpen} onOpenChange={(open) => { setMenuOpen(open); if (!open) setContextPos(null); }}>
            <DropdownMenuTrigger asChild>
              {contextPos ? (
                <span
                  style={{
                    position: "fixed",
                    left: contextPos.x,
                    top: contextPos.y,
                    width: 0,
                    height: 0,
                    display: "block",
                    pointerEvents: "none",
                  }}
                />
              ) : (
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align={contextPos ? "start" : "end"}>
              {canPreview && (
                <DropdownMenuItem onClick={() => onPreview(object)}>
                  <Eye className="h-4 w-4" />
                  Preview
                </DropdownMenuItem>
              )}
              {!object.isFolder && (
                <CapabilityGate connectionId={connectionId} bucket={bucket} capability="object-tagging" disableOnly>
                  <DropdownMenuItem onClick={() => setTagsOpen(true)}>
                    <Tag className="h-4 w-4" />
                    Tags...
                  </DropdownMenuItem>
                </CapabilityGate>
              )}
              <CapabilityGate connectionId={connectionId} bucket={bucket} capability="download-objects" disableOnly>
                <DropdownMenuItem onClick={() => onDownload(object.key)}>
                  <Download className="h-4 w-4" />
                  {object.isFolder ? "Download as zip" : "Download"}
                </DropdownMenuItem>
              </CapabilityGate>
              {!object.isFolder && (
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
              )}
              {!object.isFolder && canWrite && (
                <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                  <Pencil className="h-4 w-4" />
                  Rename…
                </DropdownMenuItem>
              )}
              {!object.isFolder && (
                <DropdownMenuItem onClick={handleOpenProperties}>
                  <SlidersHorizontal className="h-4 w-4" />
                  Properties
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => copyToClipboard(object.key, "Key")}>
                <Copy className="h-4 w-4" />
                Copy key
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => copyToClipboard(s3Uri(bucket, object.key), "S3 URI")}>
                <Copy className="h-4 w-4" />
                Copy S3 URI
              </DropdownMenuItem>
              {endpoint && (
                <DropdownMenuItem
                  onClick={() =>
                    copyToClipboard(objectHttpUrl(endpoint, bucket, object.key, forcePathStyle ?? true), "URL")
                  }
                >
                  <LinkIcon className="h-4 w-4" />
                  Copy URL
                </DropdownMenuItem>
              )}
              {!object.isFolder && (
                <DropdownMenuItem onClick={handleOpenActivity}>
                  <Activity className="h-4 w-4" />
                  Activity
                </DropdownMenuItem>
              )}
              {hasVersioning && !object.isFolder && (
                <DropdownMenuItem onClick={handleOpenVersions}>
                  <History className="h-4 w-4" />
                  Versions
                </DropdownMenuItem>
              )}
              {object.isFolder && (() => {
                const existing = findBookmark(prefixBookmarks, connectionId, bucket, object.key);
                const pinned = !!existing;
                return (
                  <DropdownMenuItem onClick={() => {
                    if (pinned && existing) deleteBookmark.mutate(existing.id);
                    else createBookmark.mutate({ connectionId, bucket, prefix: object.key });
                  }}>
                    <Star className="size-4" />
                    {pinned ? "Unpin folder" : "Pin folder"}
                  </DropdownMenuItem>
                );
              })()}
              {hasVersioning && !object.isFolder && (
                <DropdownMenuItem
                  onClick={() =>
                    openVersionDialog({
                      connectionId,
                      bucket,
                      key: object.key,
                    })
                  }
                >
                  <History className="h-3.5 w-3.5" />
                  History
                </DropdownMenuItem>
              )}
              {canWrite && (
                <CapabilityGate connectionId={connectionId} bucket={bucket} capability="delete-objects" disableOnly>
                  <DropdownMenuItem className="text-destructive" onClick={() => onDelete(object.key)}>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </CapabilityGate>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
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
      {renameOpen && !object.isFolder && (
        <RenameDialog
          open={renameOpen}
          onClose={() => setRenameOpen(false)}
          connectionId={connectionId}
          bucket={bucket}
          objectKey={object.key}
        />
      )}
    </TableRow>
  );
}

// Memoize: re-render only when props change by identity / value.
// String/number/boolean/null props compare cheaply; the parent now passes
// stable callback identities (see file-list.tsx Step 3).
export const FileRow = React.memo(FileRowImpl);
