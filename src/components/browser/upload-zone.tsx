"use client";

import { useCallback, useState, useEffect } from "react";
import { useUploadStore, type UploadItem } from "@/lib/stores/upload-store";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries/keys";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { Upload, X, CheckCircle2, AlertCircle } from "lucide-react";

interface UploadZoneProps {
  connectionId: string;
  bucket: string;
  currentPath: string;
  disabled?: boolean;
}

export function UploadZone({
  connectionId,
  bucket,
  currentPath,
  disabled = false,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const { uploads, addUpload, updateUpload, removeUpload } = useUploadStore();
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const uploadFile = useCallback(
    async (file: File) => {
      const id = crypto.randomUUID();
      const key = currentPath + file.name;

      addUpload({ id, file, bucket, key });
      updateUpload(id, { status: "uploading" });

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("bucket", bucket);
        formData.append("key", key);
        formData.append("connectionId", connectionId);

        const response = await fetch("/api/objects/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Upload failed");
        }

        updateUpload(id, { status: "completed", progress: 100 });
        queryClient.invalidateQueries({
          queryKey: queryKeys.objects.list(connectionId, bucket, currentPath),
        });

        addNotification({
          type: "upload",
          title: "Upload complete",
          description: `Successfully uploaded ${file.name}`,
          status: "completed",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        updateUpload(id, { status: "error", error: message });
        addNotification({
          type: "upload",
          title: "Upload failed",
          error: message,
          status: "error",
        });
      }
    },
    [
      connectionId,
      bucket,
      currentPath,
      addUpload,
      updateUpload,
      addNotification,
      queryClient,
    ]
  );

  // Check if this is an external file drag (not internal S3 object drag)
  const isExternalFileDrag = useCallback((e: DragEvent): boolean => {
    if (!e.dataTransfer) return false;
    // Internal drags have our custom type, external file drags have "Files"
    const types = Array.from(e.dataTransfer.types);
    return types.includes("Files") && !types.includes("application/x-s3-objects");
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      // Only handle external file drops
      if (!isExternalFileDrag(e)) return;

      const files = Array.from(e.dataTransfer?.files || []);
      files.forEach(uploadFile);
    },
    [uploadFile, isExternalFileDrag]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    // Only handle external file drags
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
  }, [isExternalFileDrag]);

  const handleDragEnter = useCallback((e: DragEvent) => {
    // Only show overlay for external file drags
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, [isExternalFileDrag]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Only hide overlay when leaving the window
    if (e.relatedTarget === null) {
      setIsDragging(false);
    }
  }, []);

  // Global drag and drop listeners for full-screen dropzone
  useEffect(() => {
    if (disabled) {
      return;
    }

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop, disabled]);

  const activeUploads = uploads.filter(
    (u) => u.bucket === bucket && u.key.startsWith(currentPath)
  );

  return (
    <>
      {/* Full-screen drop overlay */}
      {isDragging && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-8"
        >
          <div className="w-full h-full border border-dashed border-muted-foreground/50 rounded-lg flex flex-col items-center justify-center bg-white dark:bg-zinc-950">
            <Upload className="h-16 w-16 mb-4 text-primary" />
            <p className="text-xl font-medium text-primary">
              Drop files to upload
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Files will be uploaded to the current folder
            </p>
          </div>
        </div>
      )}

      {/* Upload progress list */}
      {activeUploads.length > 0 && (
        <div className="space-y-2">
          {activeUploads.map((upload) => (
            <UploadItemComponent
              key={upload.id}
              upload={upload}
              onRemove={() => removeUpload(upload.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

interface UploadButtonProps {
  connectionId: string;
  bucket: string;
  currentPath: string;
  disabled?: boolean;
}

export function UploadButton({
  connectionId,
  bucket,
  currentPath,
  disabled = false,
}: UploadButtonProps) {
  const { addUpload, updateUpload } = useUploadStore();
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const uploadFile = useCallback(
    async (file: File) => {
      const id = crypto.randomUUID();
      const key = currentPath + file.name;

      addUpload({ id, file, bucket, key });
      updateUpload(id, { status: "uploading" });

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("bucket", bucket);
        formData.append("key", key);
        formData.append("connectionId", connectionId);

        const response = await fetch("/api/objects/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Upload failed");
        }

        updateUpload(id, { status: "completed", progress: 100 });
        queryClient.invalidateQueries({
          queryKey: queryKeys.objects.list(connectionId, bucket, currentPath),
        });

        addNotification({
          type: "upload",
          title: "Upload complete",
          description: `Successfully uploaded ${file.name}`,
          status: "completed",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        updateUpload(id, { status: "error", error: message });
        addNotification({
          type: "upload",
          title: "Upload failed",
          error: message,
          status: "error",
        });
      }
    },
    [connectionId, bucket, currentPath, addUpload, updateUpload, addNotification, queryClient]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) {
        return;
      }
      const files = Array.from(e.target.files || []);
      files.forEach(uploadFile);
      e.target.value = "";
    },
    [uploadFile, disabled]
  );

  return (
    <label>
      <input
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />
      <Button asChild disabled={disabled}>
        <span>
          <Upload className="mr-2 h-4 w-4" />
          Upload file
        </span>
      </Button>
    </label>
  );
}

function UploadItemComponent({
  upload,
  onRemove,
}: {
  upload: UploadItem;
  onRemove: () => void;
}) {
  const fileName = upload.key.split("/").pop() || upload.key;

  return (
    <div className="flex items-center gap-4 p-3 border rounded-lg">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fileName}</p>
        {upload.status === "uploading" && (
          <Progress value={upload.progress} className="h-1 mt-2" />
        )}
        {upload.status === "error" && (
          <p className="text-xs text-destructive mt-1">{upload.error}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {upload.status === "completed" && (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        )}
        {upload.status === "error" && (
          <AlertCircle className="h-5 w-5 text-destructive" />
        )}
        {(upload.status === "completed" || upload.status === "error") && (
          <Button variant="ghost" size="icon" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
