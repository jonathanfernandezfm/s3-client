"use client";

import { useState } from "react";
import { useObjects, useDeleteObjects } from "@/lib/queries/objects";
import { useConnectionStore } from "@/lib/stores/connection-store";
import { useBrowserStore } from "@/lib/stores/browser-store";
import { usePaneContextSafe } from "@/lib/contexts/pane-context";
import { Breadcrumb } from "./breadcrumb";
import { FileList } from "./file-list";
import { UploadZone, UploadButton } from "./upload-zone";
import { CreateFolderDialog } from "./create-folder-dialog";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { FilePreviewModal } from "@/components/preview/file-preview-modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, CloudOff, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import type { S3Object } from "@/types";

interface FileBrowserProps {
  connectionId: string;
  bucket: string;
  path?: string[];
  onNavigate?: (path: string) => void;
  onGoHome?: () => void;
}

export function FileBrowser({ connectionId, bucket, path = [], onNavigate, onGoHome }: FileBrowserProps) {
  const { statuses } = useConnectionStore();
  const paneContext = usePaneContextSafe();
  const paneId = paneContext?.paneId || "pane-default";

  const { getPaneState, clearSelection } = useBrowserStore();
  const paneState = getPaneState(paneId);
  const selectedItems = paneState.selectedItems;

  const currentPath = path.length > 0 ? path.join("/") + "/" : "";
  const status = statuses[connectionId];

  const { data, isFetching, refetch } = useObjects(
    connectionId,
    bucket,
    currentPath
  );
  const deleteObjects = useDeleteObjects(connectionId, bucket);

  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [previewObject, setPreviewObject] = useState<S3Object | null>(null);

  // Show loading overlay on file list while fetching
  const showLoadingOverlay = isFetching;

  if (!status?.connected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CloudOff className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Connection Not Available</h3>
        <p className="text-muted-foreground mb-4">
          The connection is not active or has been removed
        </p>
        <Button asChild>
          <Link href="/settings/connections">Configure Connections</Link>
        </Button>
      </div>
    );
  }

  const handleDelete = async (key: string) => {
    setDeletingKey(key);
  };

  const confirmDelete = async () => {
    if (!deletingKey) return;

    try {
      await deleteObjects.mutateAsync([deletingKey]);
      toast({
        title: "Deleted",
        description: "Successfully deleted the item",
      });
      setDeletingKey(null);
    } catch (error) {
      toast({
        title: "Failed to delete",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) return;

    try {
      await deleteObjects.mutateAsync(Array.from(selectedItems));
      toast({
        title: "Deleted",
        description: `Successfully deleted ${selectedItems.size} item(s)`,
      });
      clearSelection(paneId);
    } catch (error) {
      toast({
        title: "Failed to delete",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
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
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Breadcrumb
          connectionId={connectionId}
          bucket={bucket}
          path={currentPath}
          onNavigate={onNavigate}
          onGoHome={onGoHome}
        />
        <div className="flex items-center gap-2">
          {selectedItems.size > 0 && (
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
          />
          <CreateFolderDialog
            connectionId={connectionId}
            bucket={bucket}
            currentPath={currentPath}
          />
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative">
        {showLoadingOverlay && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10 rounded-lg">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div className={showLoadingOverlay ? "opacity-50 pointer-events-none" : ""}>
          <FileList
            objects={data?.objects || []}
            connectionId={connectionId}
            bucket={bucket}
            currentPath={currentPath}
            isLoading={showLoadingOverlay}
            onDelete={handleDelete}
            onPreview={setPreviewObject}
            onDownload={handleDownload}
            onNavigate={onNavigate}
            paneId={paneId}
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
      />
    </div>
  );
}
