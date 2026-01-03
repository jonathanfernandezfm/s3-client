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
  connectionId: string;
  bucket: string;
  currentPath: string;
  isLoading?: boolean;
  onDelete: (key: string) => void;
  onPreview: (object: S3Object) => void;
  onDownload: (key: string) => void;
  onNavigate?: (path: string) => void;
  paneId: string;
}

export function FileList({
  objects,
  connectionId,
  bucket,
  currentPath,
  isLoading,
  onDelete,
  onPreview,
  onDownload,
  onNavigate,
  paneId,
}: FileListProps) {
  const { getPaneState, toggleSelection, selectAll, clearSelection } =
    useBrowserStore();

  const paneState = getPaneState(paneId);
  const selectedItems = paneState.selectedItems;

  const allSelected =
    objects.length > 0 && objects.every((o) => selectedItems.has(o.key));

  const handleSelectAll = () => {
    if (allSelected) {
      clearSelection(paneId);
    } else {
      selectAll(paneId, objects.map((o) => o.key));
    }
  };

  if (objects.length === 0 && !isLoading) {
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
            connectionId={connectionId}
            bucket={bucket}
            currentPath={currentPath}
            isSelected={selectedItems.has(object.key)}
            onSelect={() => toggleSelection(paneId, object.key)}
            onDelete={() => onDelete(object.key)}
            onPreview={() => onPreview(object)}
            onDownload={() => onDownload(object.key)}
            onNavigate={onNavigate}
          />
        ))}
      </TableBody>
    </Table>
  );
}
