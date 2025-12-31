"use client";

import { useState } from "react";
import { useObjects, useDeleteObjects } from "@/lib/queries/objects";
import { useConnectionStore } from "@/lib/stores/connection-store";
import { useBrowserStore } from "@/lib/stores/browser-store";
import { Breadcrumb } from "./breadcrumb";
import { FileList } from "./file-list";
import { UploadZone } from "./upload-zone";
import { CreateFolderDialog } from "./create-folder-dialog";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { FilePreviewModal } from "@/components/preview/file-preview-modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, AlertCircle, CloudOff, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import type { S3Object } from "@/types";

interface FileBrowserProps {
  bucket: string;
  path?: string[];
}

export function FileBrowser({ bucket, path = [] }: FileBrowserProps) {
  const { status } = useConnectionStore();
  const { selectedItems, clearSelection } = useBrowserStore();
  const currentPath = path.length > 0 ? path.join("/") + "/" : "";

  const { data, isLoading, error, refetch } = useObjects(bucket, currentPath);
  const deleteObjects = useDeleteObjects(bucket);

  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [previewObject, setPreviewObject] = useState<S3Object | null>(null);

  if (!status.connected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CloudOff className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No Connection</h3>
        <p className="text-muted-foreground mb-4">
          Connect to an S3 endpoint to browse files
        </p>
        <Button asChild>
          <Link href="/settings/connections">Configure Connection</Link>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold">Failed to load objects</h3>
        <p className="text-muted-foreground mb-4">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <Button onClick={() => refetch()}>Retry</Button>
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
      clearSelection();
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
          connection: useConnectionStore.getState().connection,
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
        <Breadcrumb bucket={bucket} path={currentPath} />
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
          <CreateFolderDialog bucket={bucket} currentPath={currentPath} />
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <UploadZone bucket={bucket} currentPath={currentPath} />

      <FileList
        objects={data?.objects || []}
        bucket={bucket}
        currentPath={currentPath}
        onDelete={handleDelete}
        onPreview={setPreviewObject}
        onDownload={handleDownload}
      />

      <DeleteConfirmDialog
        isOpen={!!deletingKey}
        itemName={deletingKey?.split("/").pop() || ""}
        onClose={() => setDeletingKey(null)}
        onConfirm={confirmDelete}
        isDeleting={deleteObjects.isPending}
      />

      <FilePreviewModal
        object={previewObject}
        bucket={bucket}
        onClose={() => setPreviewObject(null)}
      />
    </div>
  );
}
