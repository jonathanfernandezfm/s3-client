"use client";

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
} from "lucide-react";
import { formatBytes, formatDate, getFileExtension, isImageFile, cn } from "@/lib/utils";
import { useFileItemBehavior } from "./use-file-item-behavior";
import { useBookmarksForBucket, useCreateBookmark, useDeleteBookmark } from "@/lib/queries/bookmarks";
import { findBookmark } from "@/lib/bookmarks-helpers";
import type { S3Object } from "@/types";

interface FileRowProps {
  object: S3Object;
  connectionId: string;
  bucket: string;
  currentPath: string;
  canWrite?: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onDownload: () => void;
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

export function FileRow({
  object,
  connectionId,
  bucket,
  currentPath,
  canWrite = true,
  isSelected,
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
}: FileRowProps) {
  const Icon = getFileIcon(object.key, object.isFolder);
  const { dragHandlers, folderDropHandlers, isFolderDragOver, isBeingDragged, canPreview, fileName } = useFileItemBehavior({
    object, paneId, connectionId, bucket, currentPath,
    allObjects, selectedItems, isDragging, canDropOnFolder,
    onDragStart, onDragEnd, onFolderDrop,
  });

  const prefixBookmarks = useBookmarksForBucket(connectionId, bucket);
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();

  const href = object.isFolder
    ? `/browser/${connectionId}/${bucket}/${object.key}`
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
        isSelected && "bg-muted",
        isFolderDragOver && object.isFolder && "bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-500 ring-inset"
      )}
      data-state={isSelected ? "selected" : undefined}
      draggable
      {...dragHandlers}
      {...(folderDropHandlers ?? {})}
      style={{ cursor: "grab" }}
    >
      <TableCell className="w-8">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          className="h-4 w-4 rounded border-gray-300"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
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
              onClick={canPreview ? onPreview : undefined}
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
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {object.isFolder ? "-" : formatBytes(object.size || 0)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {object.lastModified ? formatDate(object.lastModified) : "-"}
      </TableCell>
      <TableCell className="w-8">
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canPreview && (
                <DropdownMenuItem onClick={onPreview}>
                  <Eye className="h-4 w-4" />
                  Preview
                </DropdownMenuItem>
              )}
              {!object.isFolder && (
                <DropdownMenuItem onClick={onDownload}>
                  <Download className="h-4 w-4" />
                  Download
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
              {canWrite && (
                <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
