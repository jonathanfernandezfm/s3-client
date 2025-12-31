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
} from "lucide-react";
import { formatBytes, formatDate, getFileExtension, isImageFile } from "@/lib/utils";
import type { S3Object } from "@/types";

interface FileRowProps {
  object: S3Object;
  bucket: string;
  currentPath: string;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onDownload: () => void;
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
  bucket,
  currentPath,
  isSelected,
  onSelect,
  onDelete,
  onPreview,
  onDownload,
}: FileRowProps) {
  const Icon = getFileIcon(object.key, object.isFolder);
  const fileName = getFileName(object.key, currentPath);
  const canPreview = isImageFile(object.key);

  const href = object.isFolder
    ? `/browser/${bucket}/${object.key}`
    : undefined;

  return (
    <TableRow
      className={isSelected ? "bg-muted" : undefined}
      data-state={isSelected ? "selected" : undefined}
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
            <Link href={href} className="hover:underline">
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
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
