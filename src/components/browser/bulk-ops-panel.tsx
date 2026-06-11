"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useBulkOpsStore } from "@/lib/stores/bulk-ops-store";
import { useBrowserStore } from "@/lib/stores/browser-store";
import { useNotificationStore } from "@/lib/stores/notification-store";
import {
  deleteOneObject,
  renameObject,
  setObjectTags,
  useInvalidateNotesAndObjects,
} from "@/lib/queries/objects-bulk";
import { BulkRenameDialog } from "./bulk-rename-dialog";
import { BulkTagDialog } from "./bulk-tag-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Tag, Trash2, X, Loader2, AlertCircle, Check, Link2, Download } from "lucide-react";
import type { S3Object } from "@/types";
import type { RenamePreviewItem } from "@/lib/bulk-rename";
import { useCreateShareLink } from "@/lib/queries/share-links";
import { FeatureGate } from "@/components/shared/feature-gate";
import { CapabilityGate } from "@/components/health/capability-gate";
import { triggerZipDownload } from "@/lib/zip/trigger-zip-download";
import { zipDownloadName } from "@/lib/zip/zip-naming";

interface BulkOpsPanelProps {
  paneId: string;
  connectionId: string;
  bucket: string;
  currentPath: string;
  objects: S3Object[];
  canWrite: boolean;
}

export function BulkOpsPanel({
  paneId,
  connectionId,
  bucket,
  currentPath,
  objects,
  canWrite,
}: BulkOpsPanelProps) {
  const { getPaneState, clearSelection } = useBrowserStore();
  const selectedItems = getPaneState(paneId).selectedItems;
  const {
    dialog,
    dialogPaneId,
    progress,
    openDialog,
    closeDialog,
    startProgress,
    setCurrentKey,
    recordSuccess,
    recordFailure,
    requestCancel,
    finishProgress,
    dismissProgress,
  } = useBulkOpsStore();
  const { addNotification, updateNotification } = useNotificationStore();
  const invalidateObjects = useInvalidateNotesAndObjects();
  const createShare = useCreateShareLink();
  const [shareProgress, setShareProgress] = useState<{ done: number; total: number } | null>(null);

  async function shareAll() {
    const files = selection.filter((o) => !o.isFolder);
    if (!files.length) return;
    setShareProgress({ done: 0, total: files.length });
    const batchId = crypto.randomUUID();
    const queue = [...files];
    const workers = Array.from({ length: 5 }, async () => {
      while (queue.length) {
        const item = queue.shift()!;
        await createShare.mutateAsync({
          connectionId,
          bucket,
          key: item.key,
          expiresIn: 60 * 60 * 24 * 7,
          password: null,
          maxUses: null,
          description: null,
          batchId,
        });
        setShareProgress((p) => p ? { ...p, done: p.done + 1 } : null);
      }
    });
    await Promise.all(workers);
    setShareProgress(null);
  }

  function downloadSelectionAsZip() {
    const keys = selection.map((o) => o.key);
    if (keys.length === 0) return;
    triggerZipDownload({
      connectionId,
      bucket,
      keys,
      rootPrefix: currentPath,
      filename: zipDownloadName(keys, bucket, currentPath),
    });
    addNotification({
      type: "download",
      title: "Zip download started",
      description: `Zipping ${keys.length} item${keys.length !== 1 ? "s" : ""} — check your browser downloads`,
      status: "completed",
    });
    clearSelection(paneId);
  }

  const selection: S3Object[] = objects.filter((o) => selectedItems.has(o.key));
  const dialogOpen = dialog !== null && dialogPaneId === paneId;
  const showProgress = progress !== null && progress.paneId === paneId;
  const showIdle = !showProgress && !dialogOpen && selectedItems.size >= 2;

  const runLoop = useCallback(
    async <T,>(
      kind: "rename" | "tag" | "delete",
      items: T[],
      keyOf: (item: T) => string,
      action: (item: T) => Promise<void>
    ) => {
      const notifId =
        kind === "delete"
          ? addNotification({
              type: "delete",
              title: `Deleting ${items.length} item${items.length !== 1 ? "s" : ""}...`,
              status: "in-progress",
            })
          : null;

      startProgress(kind, paneId, items.length);
      for (const item of items) {
        if (useBulkOpsStore.getState().progress?.cancelRequested) break;
        const key = keyOf(item);
        setCurrentKey(key);
        try {
          await action(item);
          recordSuccess();
        } catch (error) {
          recordFailure({
            key,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
      finishProgress();
      invalidateObjects();
      const finalState = useBulkOpsStore.getState().progress;
      if (finalState) {
        const ok = finalState.completed - finalState.failures.length;
        const verb =
          kind === "rename" ? "Renamed" : kind === "tag" ? "Tagged" : "Deleted";
        if (notifId) {
          updateNotification(notifId, {
            status: finalState.failures.length === 0 ? "completed" : "error",
            title:
              finalState.failures.length === 0
                ? `Deleted ${ok} item${ok !== 1 ? "s" : ""}`
                : `Delete finished with ${finalState.failures.length} error${finalState.failures.length !== 1 ? "s" : ""}`,
          });
        } else {
          addNotification({
            type: kind === "rename" ? "info" : "info",
            title:
              finalState.failures.length === 0
                ? `${verb} ${ok} item${ok !== 1 ? "s" : ""}`
                : `${kind} finished with ${finalState.failures.length} error${finalState.failures.length !== 1 ? "s" : ""}`,
            status: finalState.failures.length === 0 ? "completed" : "error",
          });
        }
      }
      if (finalState && finalState.failures.length === 0) {
        clearSelection(paneId);
      }
    },
    [
      paneId,
      startProgress,
      setCurrentKey,
      recordSuccess,
      recordFailure,
      finishProgress,
      invalidateObjects,
      addNotification,
      updateNotification,
      clearSelection,
    ]
  );

  const handleRenameApply = useCallback(
    async (items: RenamePreviewItem[]) => {
      closeDialog();
      await runLoop(
        "rename",
        items,
        (it) => it.oldKey,
        (it) =>
          renameObject({
            connectionId,
            bucket,
            sourceKey: it.oldKey,
            targetKey: it.newKey,
          })
      );
    },
    [closeDialog, runLoop, connectionId, bucket]
  );

  const handleTagApply = useCallback(
    async (tags: Array<{ key: string; value: string }>) => {
      closeDialog();
      const fileKeys = selection.filter((o) => !o.isFolder).map((o) => o.key);
      await runLoop(
        "tag",
        fileKeys,
        (k) => k,
        (k) => setObjectTags({ connectionId, bucket, key: k, tags })
      );
    },
    [closeDialog, runLoop, selection, connectionId, bucket]
  );

  const handleDeleteConfirm = useCallback(async () => {
    closeDialog();
    const keys = selection.map((o) => o.key);
    await runLoop(
      "delete",
      keys,
      (k) => k,
      (k) => deleteOneObject({ connectionId, bucket, key: k })
    );
  }, [closeDialog, runLoop, selection, connectionId, bucket]);

  if (!showIdle && !showProgress && !dialogOpen) {
    return null;
  }

  return (
    <>
      {showIdle && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 rounded-full border bg-card shadow-lg"
          role="toolbar"
          aria-label="Bulk operations"
        >
          <span className="text-sm font-medium px-2">
            {selectedItems.size} selected
          </span>
          <div className="h-5 w-px bg-border" />
          <CapabilityGate connectionId={connectionId} bucket={bucket} capability="download-objects">
            <Button size="sm" variant="ghost" onClick={downloadSelectionAsZip}>
              <Download className="h-4 w-4" />
              Download
            </Button>
          </CapabilityGate>
          {canWrite && (
            <Button size="sm" variant="ghost" onClick={() => openDialog("rename", paneId)}>
              <Pencil className="h-4 w-4" />
              Rename
            </Button>
          )}
          {canWrite && (
            <CapabilityGate connectionId={connectionId} bucket={bucket} capability="object-tagging">
              <Button size="sm" variant="ghost" onClick={() => openDialog("tag", paneId)}>
                <Tag className="h-4 w-4" />
                Tag
              </Button>
            </CapabilityGate>
          )}
          {canWrite && (
            <FeatureGate feature="shareLinks" label="Share Links">
              <Button
                size="sm"
                variant="ghost"
                onClick={shareAll}
                disabled={shareProgress !== null}
              >
                <Link2 className="h-4 w-4" />
                {shareProgress ? `${shareProgress.done}/${shareProgress.total}` : "Share"}
              </Button>
            </FeatureGate>
          )}
          {canWrite && (
            <CapabilityGate connectionId={connectionId} bucket={bucket} capability="delete-objects">
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => openDialog("delete", paneId)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </CapabilityGate>
          )}
          <div className="h-5 w-px bg-border" />
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => clearSelection(paneId)}
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {showProgress && progress && progress.kind !== "delete" && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[min(560px,90vw)] p-3 rounded-xl border bg-card shadow-lg">
          <div className="flex items-center gap-3">
            {progress.finishedAt ? (
              progress.failures.length === 0 ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">
                {progress.finishedAt
                  ? "Finished"
                  : `${capitalize(progress.kind)} ${progress.completed} / ${progress.total}`}
                {progress.failures.length > 0 &&
                  ` (${progress.failures.length} failed)`}
              </div>
              {progress.currentKey && !progress.finishedAt && (
                <div
                  className="text-xs text-muted-foreground truncate"
                  title={progress.currentKey}
                >
                  {progress.currentKey}
                </div>
              )}
            </div>
            {!progress.finishedAt ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={requestCancel}
                disabled={progress.cancelRequested}
              >
                {progress.cancelRequested ? "Cancelling…" : "Cancel"}
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={dismissProgress}>
                Dismiss
              </Button>
            )}
          </div>
          <div className="mt-2">
            <Progress value={(progress.completed / Math.max(progress.total, 1)) * 100} />
          </div>
          {progress.finishedAt && progress.failures.length > 0 && (
            <div className="mt-2 max-h-32 overflow-y-auto text-xs font-mono border-t pt-2 space-y-1">
              {progress.failures.map((f) => (
                <div key={f.key} className="truncate" title={`${f.key}: ${f.error}`}>
                  <span className="text-destructive">{f.key}</span>: {f.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <BulkRenameDialog
        open={dialog === "rename" && dialogPaneId === paneId}
        onClose={closeDialog}
        selection={selection}
        onApply={handleRenameApply}
      />
      <BulkTagDialog
        open={dialog === "tag" && dialogPaneId === paneId}
        onClose={closeDialog}
        selection={selection}
        onApply={handleTagApply}
      />
      <Dialog
        open={dialog === "delete" && dialogPaneId === paneId}
        onOpenChange={(o) => {
          if (!o) closeDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selection.length} item{selection.length !== 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>
              This permanently deletes the selected objects. Folders are deleted as
              zero-byte markers; their contents are not removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
