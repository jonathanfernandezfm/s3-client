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
import { nextAvailableKey } from "@/lib/uploads/conflict-name";
import { useUploadConflictStore } from "@/lib/stores/upload-conflict-store";

// NOTE: plan 026's objectDisplayName is not available on this branch — use a local helper.
function basename(key: string): string {
  const k = key.endsWith("/") ? key.slice(0, -1) : key;
  const i = k.lastIndexOf("/");
  return i === -1 ? k : k.slice(i + 1);
}

const MAX_CONFLICT_CHECK = 1000;

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
    async (files: FileWithPath[]) => {
      if (files.length === 0) {
        notify("info", "Nothing to upload", "No files were found in the selection.");
        return;
      }

      const targets = files.map(({ file, relativePath }) => ({
        file,
        key: currentPath + relativePath,
      }));

      // Local helper: build EnqueueInput array and dispatch.
      const enqueue = (keys: string[], srcs: { file: File }[]) =>
        enqueueUploads(
          srcs.map((t, i) => ({
            file: t.file,
            connectionId,
            bucket,
            key: keys[i],
            onComplete: () =>
              queryClient.invalidateQueries({
                // Folder uploads can create new prefixes, so invalidate all
                // object listings for this bucket.
                queryKey: [...queryKeys.objects.all, connectionId, bucket],
              }),
          }))
        );

      if (targets.length > MAX_CONFLICT_CHECK) {
        notify(
          "info",
          "Uploading",
          `Existing files may be overwritten (${targets.length} files, conflict check skipped).`
        );
        enqueue(targets.map((t) => t.key), targets);
        return;
      }

      let existing: string[] = [];
      try {
        const res = await fetch("/api/objects/exists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionId,
            bucket,
            keys: targets.map((t) => t.key),
          }),
        });
        if (res.ok) {
          existing = ((await res.json()) as { existing?: string[] }).existing ?? [];
        } else {
          notify(
            "info",
            "Uploading",
            "Couldn't check for existing files; they may be overwritten."
          );
        }
      } catch {
        notify(
          "info",
          "Uploading",
          "Couldn't check for existing files; they may be overwritten."
        );
      }

      const existingSet = new Set(existing);
      if (existingSet.size === 0) {
        enqueue(targets.map((t) => t.key), targets);
        return;
      }

      const choice = await useUploadConflictStore.getState().ask({
        total: targets.length,
        conflictCount: existingSet.size,
        conflictNames: existing.map((k) => basename(k)),
      });

      if (choice === "cancel") return;

      if (choice === "skip") {
        const kept = targets.filter((t) => !existingSet.has(t.key));
        if (kept.length === 0) {
          notify("info", "Nothing to upload", "All selected files were skipped.");
          return;
        }
        enqueue(kept.map((t) => t.key), kept);
        return;
      }

      if (choice === "replace") {
        enqueue(targets.map((t) => t.key), targets);
        return;
      }

      // keep-both: rename only the colliding ones; reserve names as we go.
      const taken = new Set(existingSet);
      const renamedKeys = targets.map((t) => {
        const k = nextAvailableKey(t.key, taken);
        taken.add(k);
        return k;
      });
      enqueue(renamedKeys, targets);
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
