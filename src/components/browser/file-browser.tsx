"use client";

import { useState, useCallback } from "react";
import { useObjects, useDeleteObjects, useCopyObjects, useMoveObjects } from "@/lib/queries/objects";
import { useConnections } from "@/lib/queries/connections";
import { useBrowserStore } from "@/lib/stores/browser-store";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { usePaneContextSafe } from "@/lib/contexts/pane-context";
import { Breadcrumb } from "./breadcrumb";
import { FileList } from "./file-list";
import { UploadZone, UploadButton } from "./upload-zone";
import { CreateFolderDialog } from "./create-folder-dialog";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { FilePreviewModal } from "@/components/preview/file-preview-modal";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import type { S3Object } from "@/types";

interface FileBrowserProps {
  connectionId: string;
  bucket: string;
  path?: string[];
  onNavigate?: (path: string) => void;
  onGoHome?: () => void;
}

export function FileBrowser({ connectionId, bucket, path = [], onNavigate, onGoHome }: FileBrowserProps) {
  const paneContext = usePaneContextSafe();
  const paneId = paneContext?.paneId || "pane-default";

  const { getPaneState, clearSelection, dragState, startDrag, endDrag } = useBrowserStore();
  const { addNotification, updateNotification } = useNotificationStore();
  const { data: connections = [] } = useConnections();
  const paneState = getPaneState(paneId);
  const selectedItems = paneState.selectedItems;
  const connection = connections.find((item) => item.id === connectionId);
  const canWrite = connection ? connection.role === "ADMIN" : true;

  const currentPath = path.length > 0 ? path.join("/") + "/" : "";

  const { data, isFetching, refetch } = useObjects(
    connectionId,
    bucket,
    currentPath
  );
  const deleteObjects = useDeleteObjects(connectionId, bucket);
  const copyObjects = useCopyObjects();
  const moveObjects = useMoveObjects();

  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [previewObject, setPreviewObject] = useState<S3Object | null>(null);

  // Show loading overlay on file list while fetching
  const showLoadingOverlay = isFetching;

  // Drag and drop state
  const isDragging = dragState.isDragging;
  const isValidDropTarget =
    canWrite &&
    isDragging &&
    (dragState.sourcePaneId !== paneId ||
      dragState.sourceConnectionId !== connectionId ||
      dragState.sourceBucket !== bucket ||
      dragState.sourcePath !== currentPath);

  const handleDragStart = useCallback(
    (items: S3Object[]) => {
      startDrag(paneId, connectionId, bucket, currentPath, items);
    },
    [paneId, connectionId, bucket, currentPath, startDrag]
  );

  const handleDragEnd = useCallback(() => {
    endDrag();
  }, [endDrag]);

  const handleDrop = useCallback(
    async (
      data: {
        sourcePaneId: string;
        connectionId: string;
        bucket: string;
        path: string;
        items: S3Object[];
      },
      operation: "copy" | "move",
      targetFolder?: string
    ) => {
      if (!canWrite) {
        return;
      }

      const targetPath = targetFolder || currentPath;
      const totalCount = data.items.length;
      const operationLabel = operation === "copy" ? "Copying" : "Moving";
      const pastLabel = operation === "copy" ? "Copied" : "Moved";

      // Create notification for progress tracking
      const notificationId = addNotification({
        type: operation,
        title: `${operationLabel} ${totalCount} item${totalCount !== 1 ? "s" : ""}`,
        description: `${data.bucket} → ${bucket}`,
        status: "in-progress",
      });

      try {
        const params = {
          sourceConnectionId: data.connectionId,
          sourceBucket: data.bucket,
          sourceKeys: data.items.map((item) => item.key),
          targetConnectionId: connectionId,
          targetBucket: bucket,
          targetPath,
        };

        const result =
          operation === "copy"
            ? await copyObjects.mutateAsync(params)
            : await moveObjects.mutateAsync(params);

        if (result.summary.failed > 0) {
          const failedItems = result.results.filter((r) => !r.success);
          const errorMessage = failedItems.length > 0 && failedItems[0].error
            ? `${result.summary.failed} failed: ${failedItems[0].error}`
            : `${result.summary.failed} item(s) failed`;
          updateNotification(notificationId, {
            status: "error",
            title: `Failed to ${operation}`,
            error: errorMessage,
            completedAt: new Date(),
          });
        } else {
          updateNotification(notificationId, {
            status: "completed",
            title: `${pastLabel} ${totalCount} item${totalCount !== 1 ? "s" : ""}`,
            completedAt: new Date(),
          });
        }

        // Clear selection in source pane after move
        if (operation === "move" && result.summary.failed === 0) {
          clearSelection(data.sourcePaneId);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        updateNotification(notificationId, {
          status: "error",
          title: `Failed to ${operation}`,
          error: errorMessage,
          completedAt: new Date(),
        });
      }

      endDrag();
    },
    [
      canWrite,
      connectionId,
      bucket,
      currentPath,
      copyObjects,
      moveObjects,
      addNotification,
      updateNotification,
      clearSelection,
      endDrag,
    ]
  );

  const handleDelete = async (key: string) => {
    if (!canWrite) return;
    setDeletingKey(key);
  };

  const confirmDelete = async () => {
    if (!canWrite) return;
    if (!deletingKey) return;

    try {
      await deleteObjects.mutateAsync([deletingKey]);
      addNotification({
        type: "delete",
        title: "Deleted",
        description: "Successfully deleted the item",
        status: "completed",
      });
      setDeletingKey(null);
    } catch (error) {
      addNotification({
        type: "delete",
        title: "Failed to delete",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
    }
  };

  const handleBulkDelete = async () => {
    if (!canWrite) return;
    if (selectedItems.size === 0) return;

    try {
      await deleteObjects.mutateAsync(Array.from(selectedItems));
      addNotification({
        type: "delete",
        title: "Deleted",
        description: `Successfully deleted ${selectedItems.size} item(s)`,
        status: "completed",
      });
      clearSelection(paneId);
    } catch (error) {
      addNotification({
        type: "delete",
        title: "Failed to delete",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
    }
  };

  const handleDownload = async (key: string) => {
    try {
      const response = await fetch("/api/objects/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          bucket,
          key,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get download URL");
      }

      const { url } = await response.json();
      window.open(url, "_blank");
    } catch (error) {
      addNotification({
        type: "download",
        title: "Download failed",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
    }
  };

  return (
    <div className="flex flex-col flex-1 gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Breadcrumb
            connectionId={connectionId}
            bucket={bucket}
            path={currentPath}
            onNavigate={onNavigate}
            onGoHome={onGoHome}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!canWrite && (
            <span className="text-xs uppercase tracking-wide text-muted-foreground border rounded px-2 py-1">
              Viewer
            </span>
          )}
          {canWrite && selectedItems.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={deleteObjects.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete ({selectedItems.size})
            </Button>
          )}
          <UploadButton
            connectionId={connectionId}
            bucket={bucket}
            currentPath={currentPath}
            disabled={!canWrite}
          />
          <CreateFolderDialog
            connectionId={connectionId}
            bucket={bucket}
            currentPath={currentPath}
            disabled={!canWrite}
          />
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative flex-1 flex flex-col">
        {showLoadingOverlay && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10 rounded-lg">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div className={`flex-1 flex flex-col ${showLoadingOverlay ? "opacity-50 pointer-events-none" : ""}`}>
          <FileList
            objects={data?.objects || []}
            connectionId={connectionId}
            bucket={bucket}
            currentPath={currentPath}
            canWrite={canWrite}
            isLoading={showLoadingOverlay}
            onDelete={handleDelete}
            onPreview={setPreviewObject}
            onDownload={handleDownload}
            onNavigate={onNavigate}
            paneId={paneId}
            onDrop={handleDrop}
            isDragging={isDragging}
            isValidDropTarget={isValidDropTarget}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        </div>
      </div>

      <DeleteConfirmDialog
        isOpen={!!deletingKey}
        itemName={deletingKey?.split("/").pop() || ""}
        onClose={() => setDeletingKey(null)}
        onConfirm={confirmDelete}
        isDeleting={deleteObjects.isPending}
      />

      <FilePreviewModal
        object={previewObject}
        connectionId={connectionId}
        bucket={bucket}
        onClose={() => setPreviewObject(null)}
      />

      <UploadZone
        connectionId={connectionId}
        bucket={bucket}
        currentPath={currentPath}
        disabled={!canWrite}
      />
    </div>
  );
}
