"use client";

import { useCallback, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries/keys";
import { Button } from "@/components/ui/button";
import { enqueueUploads } from "@/lib/uploads/controller";
import {
  filesFromDataTransfer,
  type FileWithPath,
} from "@/lib/uploads/folder-walk";
import { Upload, FolderUp } from "lucide-react";
import { notify } from "@/lib/stores/notification-store";

interface UploadZoneProps {
  connectionId: string;
  bucket: string;
  currentPath: string;
  disabled?: boolean;
}

function useEnqueueFiles(
  connectionId: string,
  bucket: string,
  currentPath: string
) {
  const queryClient = useQueryClient();
  return useCallback(
    (files: FileWithPath[]) => {
      if (files.length === 0) {
        notify("info", "Nothing to upload", "No files were found in the selection.");
        return;
      }
      enqueueUploads(
        files.map(({ file, relativePath }) => ({
          file,
          connectionId,
          bucket,
          key: currentPath + relativePath,
          onComplete: () =>
            queryClient.invalidateQueries({
              // Folder uploads can create new prefixes, so invalidate all
              // object listings for this bucket.
              queryKey: [...queryKeys.objects.all, connectionId, bucket],
            }),
        }))
      );
    },
    [connectionId, bucket, currentPath, queryClient]
  );
}

export function UploadZone({
  connectionId,
  bucket,
  currentPath,
  disabled = false,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const enqueueFiles = useEnqueueFiles(connectionId, bucket, currentPath);

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

      if (!isExternalFileDrag(e) || !e.dataTransfer) return;

      // filesFromDataTransfer captures entry handles synchronously (required —
      // they expire with the event), then traverses folders asynchronously.
      void filesFromDataTransfer(e.dataTransfer).then(enqueueFiles);
    },
    [enqueueFiles, isExternalFileDrag]
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
    },
    [isExternalFileDrag]
  );

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    },
    [isExternalFileDrag]
  );

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
            <p className="text-xl font-medium text-primary">
              Drop files or folders to upload
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Uploads go to the current folder
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
  const enqueueFiles = useEnqueueFiles(connectionId, bucket, currentPath);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      const files: FileWithPath[] = Array.from(e.target.files || []).map(
        (file) => ({ file, relativePath: file.name })
      );
      enqueueFiles(files);
      e.target.value = "";
    },
    [enqueueFiles, disabled]
  );

  return (
    <label onClick={disabled ? (e) => e.preventDefault() : undefined}>
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

export function UploadFolderButton({
  connectionId,
  bucket,
  currentPath,
  disabled = false,
}: UploadButtonProps) {
  const enqueueFiles = useEnqueueFiles(connectionId, bucket, currentPath);

  const handleFolderSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      const files: FileWithPath[] = Array.from(e.target.files || []).map(
        (file) => ({
          // webkitRelativePath is "pickedFolder/sub/file.txt" — keep the
          // folder name so the structure lands under the current path.
          file,
          relativePath: file.webkitRelativePath || file.name,
        })
      );
      enqueueFiles(files);
      e.target.value = "";
    },
    [enqueueFiles, disabled]
  );

  return (
    <label onClick={disabled ? (e) => e.preventDefault() : undefined}>
      <input
        type="file"
        multiple
        // Non-standard but universally supported attribute for folder pickers.
        {...{ webkitdirectory: "" }}
        onChange={handleFolderSelect}
        className="hidden"
        disabled={disabled}
      />
      <Button asChild variant="outline" disabled={disabled}>
        <span>
          <FolderUp className="h-4 w-4" />
          Upload folder
        </span>
      </Button>
    </label>
  );
}
