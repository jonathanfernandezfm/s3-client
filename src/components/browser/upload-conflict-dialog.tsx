"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useUploadConflictStore,
  type ConflictChoice,
} from "@/lib/stores/upload-conflict-store";

const MAX_NAMES_SHOWN = 10;

export function UploadConflictDialog() {
  const pending = useUploadConflictStore((s) => s.pending);
  const resolve = useUploadConflictStore((s) => s.resolve);

  if (!pending) return null;

  const { total, conflictCount, conflictNames } = pending;
  const shown = conflictNames.slice(0, MAX_NAMES_SHOWN);
  const extra = conflictNames.length - shown.length;

  function handleChoice(choice: ConflictChoice) {
    resolve(choice);
  }

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) handleChoice("cancel");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Some files already exist</DialogTitle>
          <DialogDescription>
            {conflictCount} of {total} file{total !== 1 ? "s" : ""} already
            exist in this folder:
          </DialogDescription>
        </DialogHeader>
        <ul className="my-2 max-h-48 overflow-y-auto space-y-1 text-sm text-muted-foreground">
          {shown.map((name) => (
            <li key={name} className="truncate px-1">
              {name}
            </li>
          ))}
          {extra > 0 && (
            <li className="px-1 text-xs text-muted-foreground/70">
              +{extra} more
            </li>
          )}
        </ul>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => handleChoice("cancel")}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleChoice("skip")}>
            Skip existing
          </Button>
          <Button onClick={() => handleChoice("keep-both")}>Keep both</Button>
          <Button
            variant="destructive"
            onClick={() => handleChoice("replace")}
          >
            Replace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
