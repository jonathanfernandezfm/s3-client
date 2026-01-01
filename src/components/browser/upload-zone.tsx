"use client";

import { useCallback, useState } from "react";
import { useConnectionStore } from "@/lib/stores/connection-store";
import { useUploadStore, type UploadItem } from "@/lib/stores/upload-store";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries/keys";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Upload, X, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  connectionId: string;
  bucket: string;
  currentPath: string;
}

export function UploadZone({
  connectionId,
  bucket,
  currentPath,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const { getConnection } = useConnectionStore();
  const { uploads, addUpload, updateUpload, removeUpload } = useUploadStore();
  const queryClient = useQueryClient();

  const uploadFile = useCallback(
    async (file: File) => {
      const connection = getConnection(connectionId);
      if (!connection) {
        toast({
          title: "Upload failed",
          description: "Connection not found",
          variant: "destructive",
        });
        return;
      }

      const id = crypto.randomUUID();
      const key = currentPath + file.name;

      addUpload({ id, file, bucket, key });
      updateUpload(id, { status: "uploading" });

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("bucket", bucket);
        formData.append("key", key);
        formData.append("connection", JSON.stringify(connection));

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

        toast({
          title: "Upload complete",
          description: `Successfully uploaded ${file.name}`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        updateUpload(id, { status: "error", error: message });
        toast({
          title: "Upload failed",
          description: message,
          variant: "destructive",
        });
      }
    },
    [
      connectionId,
      bucket,
      currentPath,
      getConnection,
      addUpload,
      updateUpload,
      queryClient,
    ]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      files.forEach(uploadFile);
    },
    [uploadFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      files.forEach(uploadFile);
      e.target.value = "";
    },
    [uploadFile]
  );

  const activeUploads = uploads.filter(
    (u) => u.bucket === bucket && u.key.startsWith(currentPath)
  );

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <Upload className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-2">
          Drag and drop files here, or click to select
        </p>
        <label>
          <input
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button variant="secondary" asChild>
            <span>Select Files</span>
          </Button>
        </label>
      </div>

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
    </div>
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
