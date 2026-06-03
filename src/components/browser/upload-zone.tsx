"use client";

import { useCallback, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries/keys";
import { Button } from "@/components/ui/button";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { Upload } from "lucide-react";

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
  const { addNotification, updateNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const uploadFile = useCallback(
    async (file: File) => {
      const key = currentPath + file.name;

      const notifId = addNotification({
        type: "upload",
        title: "Uploading...",
        description: file.name,
        status: "in-progress",
      });

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

        queryClient.invalidateQueries({
          queryKey: queryKeys.objects.list(connectionId, bucket, currentPath),
        });

        updateNotification(notifId, {
          status: "completed",
          title: "Upload complete",
          description: `Successfully uploaded ${file.name}`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        updateNotification(notifId, {
          status: "error",
          title: "Upload failed",
          error: message,
        });
      }
    },
    [connectionId, bucket, currentPath, addNotification, updateNotification, queryClient]
  );

  const isExternalFileDrag = useCallback((e: DragEvent): boolean => {
    if (!e.dataTransfer) return false;
    const types = Array.from(e.dataTransfer.types);
    return types.includes("Files") && !types.includes("application/x-s3-objects");
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (!isExternalFileDrag(e)) return;

      const files = Array.from(e.dataTransfer?.files || []);
      files.forEach(uploadFile);
    },
    [uploadFile, isExternalFileDrag]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
  }, [isExternalFileDrag]);

  const handleDragEnter = useCallback((e: DragEvent) => {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, [isExternalFileDrag]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.relatedTarget === null) {
      setIsDragging(false);
    }
  }, []);

  useEffect(() => {
    if (disabled) return;

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

  return (
    <>
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-8">
          <div className="w-full h-full border border-dashed border-muted-foreground/50 rounded-lg flex flex-col items-center justify-center bg-white dark:bg-zinc-950">
            <Upload className="h-16 w-16 mb-4 text-primary" />
            <p className="text-xl font-medium text-primary">Drop files to upload</p>
            <p className="text-sm text-muted-foreground mt-2">
              Files will be uploaded to the current folder
            </p>
          </div>
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
  const { addNotification, updateNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const uploadFile = useCallback(
    async (file: File) => {
      const key = currentPath + file.name;

      const notifId = addNotification({
        type: "upload",
        title: "Uploading...",
        description: file.name,
        status: "in-progress",
      });

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

        queryClient.invalidateQueries({
          queryKey: queryKeys.objects.list(connectionId, bucket, currentPath),
        });

        updateNotification(notifId, {
          status: "completed",
          title: "Upload complete",
          description: `Successfully uploaded ${file.name}`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        updateNotification(notifId, {
          status: "error",
          title: "Upload failed",
          error: message,
        });
      }
    },
    [connectionId, bucket, currentPath, addNotification, updateNotification, queryClient]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
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
          <Upload className="h-4 w-4" />
          Upload file
        </span>
      </Button>
    </label>
  );
}
