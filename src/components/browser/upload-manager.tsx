"use client";

import Link from "next/link";
import { useUploadStore, type UploadItem } from "@/lib/stores/upload-store";
import {
  pauseUpload,
  resumeUpload,
  cancelUpload,
  removeUpload,
  clearFinishedUploads,
} from "@/lib/uploads/controller";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";
import {
  Pause,
  Play,
  X,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Upload,
  Ban,
} from "lucide-react";

function ItemControls({ item }: { item: UploadItem }) {
  switch (item.status) {
    case "uploading":
      return (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => pauseUpload(item.id)}
            aria-label="Pause"
            title="Pause"
          >
            <Pause className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => cancelUpload(item.id)}
            aria-label="Cancel"
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      );
    case "queued":
      return (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => cancelUpload(item.id)}
          aria-label="Cancel"
          title="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      );
    case "paused":
      return (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => resumeUpload(item.id)}
            aria-label="Resume"
            title="Resume"
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => cancelUpload(item.id)}
            aria-label="Cancel"
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      );
    case "error":
      return (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => resumeUpload(item.id)}
            aria-label="Retry"
            title="Retry"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => removeUpload(item.id)}
            aria-label="Dismiss"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      );
    case "completed":
    case "canceled":
      return (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => removeUpload(item.id)}
          aria-label="Dismiss"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      );
    default: {
      const exhaustive: never = item.status;
      void exhaustive;
      return null;
    }
  }
}

function StatusIcon({ status }: { status: UploadItem["status"] }) {
  if (status === "completed")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />;
  if (status === "error")
    return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />;
  if (status === "canceled")
    return <Ban className="h-4 w-4 shrink-0 text-muted-foreground" />;
  return <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function statusLabel(item: UploadItem): string {
  switch (item.status) {
    case "queued":
      return "Queued";
    case "uploading":
      return `${formatBytes(item.loaded)} / ${formatBytes(item.size)}`;
    case "paused":
      return `Paused — ${formatBytes(item.loaded)} / ${formatBytes(item.size)}`;
    case "completed":
      return formatBytes(item.size);
    case "canceled":
      return "Canceled";
    case "error":
      return item.error ?? "Upload failed";
  }
}

export function UploadManager() {
  const items = useUploadStore((state) => state.items);

  if (items.length === 0) return null;

  const activeCount = items.filter(
    (i) => i.status === "uploading" || i.status === "queued"
  ).length;
  const hasFinished = items.some(
    (i) =>
      i.status === "completed" ||
      i.status === "error" ||
      i.status === "canceled"
  );

  return (
    <div className="fixed bottom-4 left-4 md:left-72 z-50 w-96 rounded-lg border bg-card shadow-lg">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="text-sm font-medium">
          Uploads{activeCount > 0 ? ` (${activeCount} active)` : ""}
        </p>
        {hasFinished && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={clearFinishedUploads}
          >
            Clear finished
          </Button>
        )}
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto p-2">
        {items.map((item) => {
          const percent =
            item.size > 0
              ? Math.round((item.loaded / item.size) * 100)
              : item.status === "completed"
                ? 100
                : 0;
          return (
            <div key={item.id} className="rounded-md px-2 py-1.5 hover:bg-muted/50">
              <div className="flex items-center gap-2">
                <StatusIcon status={item.status} />
                <span className="min-w-0 flex-1 truncate text-sm" title={item.key}>
                  {item.fileName}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <ItemControls item={item} />
                </div>
              </div>
              {(item.status === "uploading" || item.status === "paused") && (
                <Progress value={percent} className="mt-1.5 h-1.5" />
              )}
              <p
                className={`mt-1 truncate text-xs ${
                  item.status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
                title={item.status === "error" ? item.error : undefined}
              >
                {statusLabel(item)}
              </p>
              {item.status === "error" && item.error?.includes("CORS") && (
                <Link
                  href={`/app/buckets/${item.connectionId}/${encodeURIComponent(item.bucket)}?tab=permissions`}
                  className="mt-0.5 text-xs text-primary underline-offset-2 hover:underline"
                >
                  Check permissions →
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
