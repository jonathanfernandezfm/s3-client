"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renameObject, useInvalidateNotesAndObjects } from "@/lib/queries/objects-bulk";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { computeRenameTarget, basename } from "@/lib/rename-key";

interface RenameDialogProps {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  bucket: string;
  objectKey: string; // a FILE key (never ends with "/")
}

export function RenameDialog({ open, onClose, connectionId, bucket, objectKey }: RenameDialogProps) {
  const [name, setName] = useState(() => basename(objectKey));
  const [submitting, setSubmitting] = useState(false);
  const { addNotification } = useNotificationStore();
  const invalidate = useInvalidateNotesAndObjects();

  const result = computeRenameTarget(objectKey, name);
  const canApply = result.ok && !submitting;

  async function handleApply() {
    if (!result.ok) return;
    setSubmitting(true);
    try {
      await renameObject({ connectionId, bucket, sourceKey: objectKey, targetKey: result.targetKey });
      addNotification({ type: "info", title: "File renamed", description: `${basename(objectKey)} → ${name.trim()}`, status: "completed" });
      invalidate();
      onClose();
    } catch (error) {
      addNotification({
        type: "error",
        title: "Rename failed",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename file</DialogTitle>
          <DialogDescription>Enter a new name. The file stays in the same folder.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="rename-input">New name</Label>
          <Input
            id="rename-input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canApply) handleApply(); }}
          />
          {!result.ok && result.error !== "unchanged" && (
            <p className="text-sm text-destructive">{result.error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply} disabled={!canApply}>Rename</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
