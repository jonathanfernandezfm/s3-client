"use client";

import { useRef, useState } from "react";
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
} from "lucide-react";
import { formatBytes, formatDate, getFileExtension, isImageFile, cn } from "@/lib/utils";
import { createDragPreview, removeDragPreview } from "./drag-preview";
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

function getFileName(key: string, prefix: string) {
  const name = key.replace(prefix, "");
  return name.endsWith("/") ? name.slice(0, -1) : name;
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
  const fileName = getFileName(object.key, currentPath);
  const canPreview = isImageFile(object.key);
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const [isFolderDragOver, setIsFolderDragOver] = useState(false);

  const href = object.isFolder
    ? `/browser/${connectionId}/${bucket}/${object.key}`
    : undefined;

  const handleFolderClick = (e: React.MouseEvent) => {
    if (onNavigate && object.isFolder) {
      e.preventDefault();
      onNavigate(object.key);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    // Determine which items to drag
    let itemsToDrag: S3Object[];

    if (selectedItems.has(object.key)) {
      // Dragging a selected item - drag all selected items
      itemsToDrag = allObjects.filter((o) => selectedItems.has(o.key));
    } else {
      // Dragging an unselected item - drag only this item
      itemsToDrag = [object];
    }

    // Set drag data
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

    // Create and set custom drag image
    const preview = createDragPreview(itemsToDrag);
    dragPreviewRef.current = preview;
    e.dataTransfer.setDragImage(preview, 0, 0);

    // Notify parent
    onDragStart?.(itemsToDrag);
  };

  const handleDragEnd = () => {
    // Clean up drag preview
    if (dragPreviewRef.current) {
      removeDragPreview(dragPreviewRef.current);
      dragPreviewRef.current = null;
    }
    onDragEnd?.();
  };

  // Folder drop handling
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

  // Determine if this row is being dragged
  const isBeingDragged = isDragging && (selectedItems.has(object.key) || selectedItems.size === 0);

  return (
    <TableRow
      className={cn(
        isSelected && "bg-muted",
        isBeingDragged && isDragging && "opacity-50",
        isFolderDragOver && object.isFolder && "bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-500 ring-inset"
      )}
      data-state={isSelected ? "selected" : undefined}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={object.isFolder ? handleFolderDragOver : undefined}
      onDragLeave={object.isFolder ? handleFolderDragLeave : undefined}
      onDrop={object.isFolder ? handleFolderDrop : undefined}
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
              object.isFolder ? "text-blue-500" : "text-muted-foreground"
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
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {object.isFolder ? "-" : formatBytes(object.size || 0)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {object.lastModified ? formatDate(object.lastModified) : "-"}
      </TableCell>
      <TableCell className="w-8">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canPreview && (
              <DropdownMenuItem onClick={onPreview}>
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </DropdownMenuItem>
            )}
            {!object.isFolder && (
              <DropdownMenuItem onClick={onDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </DropdownMenuItem>
            )}
            {canWrite && (
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
