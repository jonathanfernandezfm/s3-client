"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useObjectTags, useInvalidateTags } from "@/lib/queries/tags";
import { setObjectTags } from "@/lib/queries/objects-bulk";
import { validateTagSet, rowId, MAX_TAGS_PER_OBJECT, type TagPair, type TagRow } from "@/lib/tags";
import { TagRowList } from "./tag-row-list";

interface TagEditorDialogProps {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  bucket: string;
  objectKey: string;
  canWrite: boolean;
}

export function TagEditorDialog({
  open,
  onClose,
  connectionId,
  bucket,
  objectKey,
  canWrite,
}: TagEditorDialogProps) {
  const tagsQuery = useObjectTags({ connectionId, bucket, key: objectKey, enabled: open });
  const invalidateTags = useInvalidateTags();
  const [rows, setRows] = useState<TagRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setRows(null);
      setSaveError(null);
      return;
    }
    if (tagsQuery.data && rows === null) {
      setRows(
        tagsQuery.data.length > 0
          ? tagsQuery.data.map((t) => ({ id: rowId(), key: t.key, value: t.value }))
          : [{ id: rowId(), key: "", value: "" }]
      );
    }
  }, [open, tagsQuery.data, rows]);

  const fileName = objectKey.split("/").pop() || objectKey;

  const tags: TagPair[] = useMemo(
    () =>
      (rows ?? [])
        .map((r) => ({ key: r.key.trim(), value: r.value.trim() }))
        .filter((t) => t.key.length > 0),
    [rows]
  );
  const validationError = useMemo(() => validateTagSet(tags), [tags]);

  const updateRow = (id: string, patch: Partial<TagRow>) =>
    setRows((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...(rs ?? []), { id: rowId(), key: "", value: "" }]);
  const removeRow = (id: string) =>
    setRows((rs) => {
      const next = (rs ?? []).filter((r) => r.id !== id);
      return next.length === 0 ? rs : next;
    });

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await setObjectTags({ connectionId, bucket, key: objectKey, tags });
      invalidateTags();
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save tags");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="truncate">Tags — {fileName}</DialogTitle>
          <DialogDescription>
            {canWrite
              ? `Up to ${MAX_TAGS_PER_OBJECT} tags per object. Saving replaces all existing tags.`
              : "You have view-only access to this connection."}
          </DialogDescription>
        </DialogHeader>

        {tagsQuery.isPending && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {tagsQuery.isError && (
          <p className="py-4 text-sm text-destructive">
            {tagsQuery.error instanceof Error
              ? tagsQuery.error.message
              : "Failed to load tags"}
          </p>
        )}

        {rows !== null && (
          <>
            <TagRowList
              rows={rows}
              onUpdate={updateRow}
              onAdd={addRow}
              onRemove={removeRow}
              disabled={!canWrite}
              validationError={validationError}
            />
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {canWrite ? "Cancel" : "Close"}
          </Button>
          {canWrite && (
            <Button
              onClick={handleSave}
              disabled={rows === null || validationError !== null || saving}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save tags
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
