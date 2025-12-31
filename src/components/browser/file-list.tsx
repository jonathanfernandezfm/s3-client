"use client";

import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileRow } from "./file-row";
import { useBrowserStore } from "@/lib/stores/browser-store";
import type { S3Object } from "@/types";

interface FileListProps {
  objects: S3Object[];
  bucket: string;
  currentPath: string;
  onDelete: (key: string) => void;
  onPreview: (object: S3Object) => void;
  onDownload: (key: string) => void;
}

export function FileList({
  objects,
  bucket,
  currentPath,
  onDelete,
  onPreview,
  onDownload,
}: FileListProps) {
  const { selectedItems, toggleSelection, selectAll, clearSelection } =
    useBrowserStore();

  const allSelected =
    objects.length > 0 && objects.every((o) => selectedItems.has(o.key));

  const handleSelectAll = () => {
    if (allSelected) {
      clearSelection();
    } else {
      selectAll(objects.map((o) => o.key));
    }
  };

  if (objects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg">
        <p className="text-muted-foreground">This folder is empty</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleSelectAll}
              className="h-4 w-4 rounded border-gray-300"
            />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Modified</TableHead>
          <TableHead className="w-8"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {objects.map((object) => (
          <FileRow
            key={object.key}
            object={object}
            bucket={bucket}
            currentPath={currentPath}
            isSelected={selectedItems.has(object.key)}
            onSelect={() => toggleSelection(object.key)}
            onDelete={() => onDelete(object.key)}
            onPreview={() => onPreview(object)}
            onDownload={() => onDownload(object.key)}
          />
        ))}
      </TableBody>
    </Table>
  );
}
