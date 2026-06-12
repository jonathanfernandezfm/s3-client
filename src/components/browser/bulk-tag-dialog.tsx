"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { S3Object } from "@/types";
import { validateTagSet, rowId, type TagRow } from "@/lib/tags";
import { TagRowList } from "./tag-row-list";

interface BulkTagDialogProps {
  open: boolean;
  onClose: () => void;
  selection: S3Object[];
  onApply: (tags: Array<{ key: string; value: string }>) => void;
}

export function BulkTagDialog({ open, onClose, selection, onApply }: BulkTagDialogProps) {
  const [rows, setRows] = useState<TagRow[]>([{ id: rowId(), key: "", value: "" }]);

  const fileSelection = useMemo(() => selection.filter((o) => !o.isFolder), [selection]);
  const folderCount = selection.length - fileSelection.length;

  const validTags = useMemo(
    () =>
      rows
        .map((r) => ({ key: r.key.trim(), value: r.value.trim() }))
        .filter((t) => t.key.length > 0),
    [rows]
  );

  const validationError = useMemo(() => validateTagSet(validTags), [validTags]);

  const canApply = fileSelection.length > 0 && validationError === null;

  const updateRow = (id: string, patch: Partial<TagRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((rs) => [...rs, { id: rowId(), key: "", value: "" }]);
  const removeRow = (id: string) =>
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((r) => r.id !== id)));

  const handleApply = () => onApply(validTags);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set tags on {fileSelection.length} item{fileSelection.length !== 1 ? "s" : ""}</DialogTitle>
          <DialogDescription>
            These tags will <strong>replace</strong> any existing tags on the selected objects.
            {folderCount > 0 && ` (${folderCount} folder${folderCount !== 1 ? "s" : ""} excluded)`}
          </DialogDescription>
        </DialogHeader>

        <TagRowList
          rows={rows}
          onUpdate={updateRow}
          onAdd={addRow}
          onRemove={removeRow}
          validationError={validationError}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply} disabled={!canApply}>
            Apply tags
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
