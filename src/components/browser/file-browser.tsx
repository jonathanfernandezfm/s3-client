"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  useObjects,
  useDeleteObjects,
  useCopyObjects,
  useMoveObjects,
} from "@/lib/queries/objects";
import { useConnections } from "@/lib/queries/connections";
import { useBrowserStore } from "@/lib/stores/browser-store";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { usePaneContextSafe } from "@/lib/contexts/pane-context";
import { usePaletteIntentStore } from "@/lib/stores/palette-intent-store";
import { useBookmarksForBucket } from "@/lib/queries/bookmarks";
import { getPathTail } from "@/lib/bookmarks-helpers";
import { Breadcrumb } from "./breadcrumb";
import { FileList } from "./file-list";
import { FileGallery } from "./file-gallery";
import { ViewModeToggle } from "./view-mode-toggle";
import { UploadZone, UploadButton, UploadFolderButton } from "./upload-zone";
import { CreateFolderDialog } from "./create-folder-dialog";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { FilePreviewModal } from "@/components/preview/file-preview-modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Star, History, MessageSquare, Activity } from "lucide-react";
import { canManageFiles } from "@/lib/roles";
import { useInfoDrawerStore } from "@/lib/stores/info-drawer-store";
import { useNotesForKey, useNoteCounts } from "@/lib/queries/notes";
import { useShareLinkCounts } from "@/lib/queries/share-links";
import { useFileTags } from "@/lib/queries/tags";
import { distinctTagValues } from "@/lib/tags";
import { TagFilterBar } from "./tag-filter-bar";
import { BulkOpsPanel } from "./bulk-ops-panel";
import { useBucketVersioning } from "@/lib/queries/buckets";
import { CapabilityGate } from "@/components/health/capability-gate";
import { triggerZipDownload } from "@/lib/zip/trigger-zip-download";
import { zipDownloadName } from "@/lib/zip/zip-naming";
import type { S3Object } from "@/types";

interface FileBrowserProps {
  connectionId: string;
  bucket: string;
  path?: string[];
  onNavigate?: (path: string) => void;
  onGoHome?: () => void;
}

const CROSS_WS_CONFIRMED_KEY = "s3-cross-workspace-confirmed";

interface PendingDrop {
  data: {
    sourcePaneId: string;
    connectionId: string;
    bucket: string;
    path: string;
    items: S3Object[];
  };
  operation: "copy" | "move";
  targetFolder?: string;
}

export function FileBrowser({
  connectionId,
  bucket,
  path = [],
  onNavigate,
  onGoHome,
}: FileBrowserProps) {
  const paneContext = usePaneContextSafe();
  const paneId = paneContext?.paneId || "pane-default";

  const { getPaneState, clearSelection, dragState, startDrag, endDrag, setViewMode } =
    useBrowserStore();
  const { isOpen: isInfoOpen, activeTab: infoTab, setScope: setInfoScope, toggle: toggleInfoDrawer } =
    useInfoDrawerStore();
  const { addNotification, updateNotification } = useNotificationStore();
  const { data: connections = [] } = useConnections();
  const paneState = getPaneState(paneId);
  const selectedItems = paneState.selectedItems;
  const connection = connections.find((item) => item.id === connectionId);
  const canWrite = connection ? canManageFiles(connection.role) : true;
  const versioning = useBucketVersioning(connectionId, bucket);

  const currentPath = path.length > 0 ? path.join("/") + "/" : "";

  useEffect(() => {
    if (!isInfoOpen) return;
    const prev = useInfoDrawerStore.getState().scope;
    const prevObjectKey =
      prev && prev.connectionId === connectionId && prev.bucket === bucket
        ? prev.objectKey
        : undefined;
    setInfoScope({
      connectionId,
      bucket,
      prefix: currentPath || undefined,
      // Keep objectKey only if it's a direct child of currentPath (not a deeper
      // descendant). startsWith("") is always true, so without the slice check
      // navigating back to root would preserve any objectKey.
      objectKey:
        prevObjectKey?.startsWith(currentPath) &&
        !prevObjectKey.slice(currentPath.length).includes("/")
          ? prevObjectKey
          : undefined,
    });
  }, [isInfoOpen, connectionId, bucket, currentPath, setInfoScope]);

  const {
    objects,
    hasMore,
    fetchNextPage,
    isFetchingNextPage,
    isPending,
    refetch,
  } = useObjects(connectionId, bucket, currentPath);
  const deleteObjects = useDeleteObjects(connectionId, bucket);
  const copyObjects = useCopyObjects();
  const moveObjects = useMoveObjects();

  const folderNotesQuery = useNotesForKey({
    connectionId,
    bucket,
    key: currentPath,
  });
  const noteButtonCount = folderNotesQuery.data?.length ?? 0;

  const folderKeys = objects
    .filter((o) => o.isFolder)
    .map((o) => o.key);
  const folderNoteCountsQuery = useNoteCounts({
    connectionId,
    bucket,
    keys: folderKeys,
  });
  const folderNoteCounts = folderNoteCountsQuery.data ?? {};

  const fileKeys = objects
    .filter((o) => !o.isFolder)
    .map((o) => o.key);
  const fileShareCountsQuery = useShareLinkCounts({
    connectionId,
    bucket,
    keys: fileKeys,
  });
  const fileShareCounts = fileShareCountsQuery.data ?? {};

  const fileTagsQuery = useFileTags({ connectionId, bucket, keys: fileKeys });
  const fileTags = fileTagsQuery.data ?? {};
  const folderTagValues = distinctTagValues(fileTags);

  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    setActiveTag(null);
  }, [connectionId, bucket, currentPath]);

  const handleTagToggle = useCallback(
    (tag: string) => {
      setActiveTag((prev) => (prev === tag ? null : tag));
      clearSelection(paneId);
    },
    [clearSelection, paneId]
  );

  const visibleObjects = activeTag
    ? objects.filter(
        (o) => o.isFolder || (fileTags[o.key] ?? []).includes(activeTag)
      )
    : objects;

  const prefixBookmarks = useBookmarksForBucket(connectionId, bucket);

  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [previewObject, setPreviewObject] = useState<S3Object | null>(null);
  const [crossWorkspacePending, setCrossWorkspacePending] =
    useState<PendingDrop | null>(null);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const intent = usePaletteIntentStore((s) => s.intent);
  const consumeIntent = usePaletteIntentStore((s) => s.consumeIntent);

  useEffect(() => {
    if (intent?.kind !== "create-folder") return;
    if (
      intent.connectionId !== connectionId ||
      intent.bucket !== bucket ||
      intent.path !== currentPath
    ) {
      return;
    }
    consumeIntent();
    setCreateFolderOpen(true);
  }, [intent, consumeIntent, connectionId, bucket, currentPath]);

  useEffect(() => {
    if (intent?.kind !== "open-preview") return;
    if (intent.connectionId !== connectionId || intent.bucket !== bucket) return;
    consumeIntent();
    setPreviewObject({
      key: intent.key,
      isFolder: intent.key.endsWith("/"),
    });
  }, [intent, consumeIntent, connectionId, bucket]);

  const guardInHistory = useRef(false);

  useEffect(() => {
    if (path.length > 0 && !guardInHistory.current) {
      history.pushState({ s3FolderGuard: true }, "");
      guardInHistory.current = true;
    }

    const handlePopState = () => {
      if (path.length > 0) {
        guardInHistory.current = false;
        const parentPath = path.slice(0, -1).join("/");
        onNavigate?.(parentPath);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [path, onNavigate]);

  const showLoadingOverlay = isPending;

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

  const executeDrop = useCallback(
    async (
      data: PendingDrop["data"],
      operation: "copy" | "move",
      targetFolder?: string
    ) => {
      if (!canWrite) return;

      const targetPath = targetFolder || currentPath;
      const totalCount = data.items.length;
      const operationLabel = operation === "copy" ? "Copying" : "Moving";
      const pastLabel = operation === "copy" ? "Copied" : "Moved";

      const sourceConn = connections.find((c) => c.id === data.connectionId);
      const targetConn = connections.find((c) => c.id === connectionId);
      const isCrossWorkspace =
        sourceConn &&
        targetConn &&
        sourceConn.workspaceId !== targetConn.workspaceId;
      const sourceLabel = sourceConn
        ? sourceConn.workspaceType === "PERSONAL"
          ? "Personal"
          : (sourceConn.name ?? "Team")
        : "";
      const targetLabel = targetConn
        ? targetConn.workspaceType === "PERSONAL"
          ? "Personal"
          : (targetConn.name ?? "Team")
        : "";
      const crossLabel = isCrossWorkspace
        ? ` (${sourceLabel} → ${targetLabel})`
        : "";

      const notificationId = addNotification({
        type: operation,
        title: `${operationLabel} ${totalCount} item${totalCount !== 1 ? "s" : ""}`,
        description: `${data.bucket} → ${bucket}${crossLabel}`,
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
          const errorMessage =
            failedItems.length > 0 && failedItems[0].error
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

        if (operation === "move" && result.summary.failed === 0) {
          clearSelection(data.sourcePaneId);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
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
      connections,
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

  const handleDrop = useCallback(
    async (
      data: PendingDrop["data"],
      operation: "copy" | "move",
      targetFolder?: string
    ) => {
      if (!canWrite) return;

      const sourceConn = connections.find((c) => c.id === data.connectionId);
      const targetConn = connections.find((c) => c.id === connectionId);
      const isCrossWorkspace =
        sourceConn &&
        targetConn &&
        sourceConn.workspaceId !== targetConn.workspaceId;

      if (isCrossWorkspace) {
        const confirmed =
          typeof window !== "undefined" &&
          localStorage.getItem(CROSS_WS_CONFIRMED_KEY) === "true";
        if (!confirmed) {
          setCrossWorkspacePending({ data, operation, targetFolder });
          endDrag();
          return;
        }
      }

      await executeDrop(data, operation, targetFolder);
    },
    [canWrite, connectionId, connections, endDrag, executeDrop]
  );

  const handleCrossWorkspaceConfirm = useCallback(async () => {
    if (!crossWorkspacePending) return;
    if (typeof window !== "undefined") {
      localStorage.setItem(CROSS_WS_CONFIRMED_KEY, "true");
    }
    const { data, operation, targetFolder } = crossWorkspacePending;
    setCrossWorkspacePending(null);
    await executeDrop(data, operation, targetFolder);
  }, [crossWorkspacePending, executeDrop]);

  const handleDelete = async (key: string) => {
    if (!canWrite) return;
    setDeletingKey(key);
  };

  const confirmDelete = async () => {
    if (!canWrite) return;
    if (!deletingKey) return;

    const keyToDelete = deletingKey;
    const itemName = keyToDelete.split("/").filter(Boolean).pop() || keyToDelete;
    setDeletingKey(null);

    const notifId = addNotification({
      type: "delete",
      title: "Deleting...",
      description: itemName,
      status: "in-progress",
    });

    try {
      await deleteObjects.mutateAsync([keyToDelete]);
      updateNotification(notifId, {
        status: "completed",
        title: "Deleted",
        description: `Successfully deleted ${itemName}`,
      });
    } catch (error) {
      updateNotification(notifId, {
        status: "error",
        title: "Failed to delete",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleDownload = async (key: string) => {
    if (key.endsWith("/")) {
      triggerZipDownload({
        connectionId,
        bucket,
        keys: [key],
        rootPrefix: currentPath,
        filename: zipDownloadName([key], bucket, currentPath),
      });
      addNotification({
        type: "download",
        title: "Zip download started",
        description: "Check your browser downloads for progress",
        status: "completed",
      });
      return;
    }

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

  const pendingSourceConn = crossWorkspacePending
    ? connections.find((c) => c.id === crossWorkspacePending.data.connectionId)
    : null;
  const pendingTargetConn = crossWorkspacePending ? connection : null;
  const pendingSourceName =
    pendingSourceConn?.workspaceType === "PERSONAL"
      ? "Personal"
      : (pendingSourceConn?.name ?? "a team workspace");
  const pendingTargetName =
    pendingTargetConn?.workspaceType === "PERSONAL"
      ? "Personal"
      : (pendingTargetConn?.name ?? "this workspace");

  return (
    <div className="flex flex-col flex-1 gap-4">
      {prefixBookmarks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b text-xs">
          <Star className="size-3 text-muted-foreground shrink-0" />
          {prefixBookmarks.map((bm) => (
            <button
              key={bm.id}
              title={bm.prefix ?? ""}
              onClick={() => onNavigate?.(bm.prefix ?? "")}
              className="px-2 py-0.5 rounded-full border border-border hover:bg-accent text-foreground"
            >
              {getPathTail(bm.prefix ?? "")}
            </button>
          ))}
        </div>
      )}
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
          {!canWrite && connection && (
            <span className="text-xs uppercase tracking-wide text-muted-foreground border rounded px-2 py-1">
              {connection.role.toLowerCase()}
            </span>
          )}
          <ViewModeToggle
            value={paneState.viewMode}
            onChange={(m) => setViewMode(paneId, m)}
          />
          <Button
            variant="secondary"
            size="icon"
            onClick={() => toggleInfoDrawer("activity")}
            title="Activity"
            className={infoTab === "activity" && isInfoOpen ? "text-primary" : ""}
          >
            <Activity className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => toggleInfoDrawer("notes")}
            title="Notes"
            className={`relative ${infoTab === "notes" && isInfoOpen ? "text-primary" : ""}`}
          >
            <MessageSquare className="h-4 w-4" />
            {noteButtonCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center px-0.5 leading-none">
                {noteButtonCount > 9 ? "9+" : noteButtonCount}
              </span>
            )}
          </Button>
          <CapabilityGate connectionId={connectionId} bucket={bucket} capability="list-versions">
            <Button
              variant="secondary"
              size="icon"
              onClick={() => toggleInfoDrawer("versions")}
              title="Versions"
              className={infoTab === "versions" && isInfoOpen ? "text-primary" : ""}
            >
              <History className="h-4 w-4" />
            </Button>
          </CapabilityGate>
          <CapabilityGate connectionId={connectionId} bucket={bucket} capability="upload-objects">
            <UploadButton
              connectionId={connectionId}
              bucket={bucket}
              currentPath={currentPath}
              disabled={!canWrite}
            />
          </CapabilityGate>
          <CapabilityGate connectionId={connectionId} bucket={bucket} capability="upload-objects">
            <UploadFolderButton
              connectionId={connectionId}
              bucket={bucket}
              currentPath={currentPath}
              disabled={!canWrite}
            />
          </CapabilityGate>
          <CapabilityGate connectionId={connectionId} bucket={bucket} capability="upload-objects">
            <CreateFolderDialog
              connectionId={connectionId}
              bucket={bucket}
              currentPath={currentPath}
              disabled={!canWrite}
              open={createFolderOpen}
              onOpenChange={setCreateFolderOpen}
            />
          </CapabilityGate>
          <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <TagFilterBar
        tags={folderTagValues}
        activeTag={activeTag}
        onToggle={handleTagToggle}
        onClear={() => handleTagToggle(activeTag ?? "")}
      />

      <div className="relative flex-1 flex flex-col">
        {versioning.data?.status === "Suspended" && (
          <div className="px-3 py-2 text-xs bg-yellow-500/10 border border-yellow-500/30 rounded mb-2">
            Versioning suspended — new uploads won&apos;t be versioned. Existing versions are preserved.
          </div>
        )}
        {showLoadingOverlay && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10 rounded-lg">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div
          className={`flex-1 flex flex-col ${showLoadingOverlay ? "opacity-50 pointer-events-none" : ""}`}
        >
          {paneState.viewMode === "grid" ? (
            <FileGallery
              objects={visibleObjects}
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
              folderNoteCounts={folderNoteCounts}
              fileShareCounts={fileShareCounts}
              fileTags={fileTags}
              activeTag={activeTag}
              onTagClick={handleTagToggle}
            />
          ) : (
            <FileList
              objects={visibleObjects}
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
              folderNoteCounts={folderNoteCounts}
              fileShareCounts={fileShareCounts}
              fileTags={fileTags}
              activeTag={activeTag}
              onTagClick={handleTagToggle}
            />
          )}
          {hasMore && !isPending && (
            <div className="flex items-center justify-center gap-2 py-3 border-t">
              <span className="text-xs text-muted-foreground">
                Showing {objects.length} items
              </span>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      <DeleteConfirmDialog
        isOpen={!!deletingKey}
        itemName={deletingKey?.split("/").filter(Boolean).pop() || ""}
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

      <BulkOpsPanel
        paneId={paneId}
        connectionId={connectionId}
        bucket={bucket}
        currentPath={currentPath}
        objects={visibleObjects}
        canWrite={canWrite}
      />

      <Dialog
        open={!!crossWorkspacePending}
        onOpenChange={(open) => {
          if (!open) setCrossWorkspacePending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cross-workspace transfer</DialogTitle>
            <DialogDescription>
              You are about to {crossWorkspacePending?.operation ?? "copy"}{" "}
              files from <strong>{pendingSourceName}</strong> to{" "}
              <strong>{pendingTargetName}</strong>. This transfers data across
              workspace boundaries. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCrossWorkspacePending(null)}
            >
              Cancel
            </Button>
            <Button onClick={handleCrossWorkspaceConfirm}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
