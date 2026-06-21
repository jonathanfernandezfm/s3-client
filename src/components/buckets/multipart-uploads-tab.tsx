"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import {
  useIncompleteUploads,
  useAbortUploads,
  type AbortResult,
} from "@/lib/queries/multipart-uploads";
import {
  sortUploadsByInitiated,
  formatRelativeAge,
  formatInitiator,
} from "./multipart-helpers";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AbortUploadsDialog } from "./abort-uploads-dialog";
import { useNotificationStore } from "@/lib/stores/notification-store";

interface MultipartUploadsTabProps {
  connectionId: string;
  bucket: string;
  canAbort: boolean;
}

export function MultipartUploadsTab({
  connectionId,
  bucket,
  canAbort,
}: MultipartUploadsTabProps) {
  const { data: uploads, isLoading, error, refetch } = useIncompleteUploads(
    connectionId,
    bucket
  );
  const abortMutation = useAbortUploads(connectionId, bucket);
  const { addNotification } = useNotificationStore();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingAbort, setPendingAbort] = useState<
    Array<{ key: string; uploadId: string }> | null
  >(null);

  const sortedUploads = useMemo(
    () => (uploads ? sortUploadsByInitiated(uploads) : []),
    [uploads]
  );

  const rowKey = (key: string, uploadId: string) => `${key}::${uploadId}`;

  const allSelected =
    sortedUploads.length > 0 && selected.size === sortedUploads.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedUploads.map((u) => rowKey(u.key, u.uploadId))));
    }
  };

  const toggleRow = (key: string, uploadId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const id = rowKey(key, uploadId);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmAbort = async () => {
    if (!pendingAbort) return;
    try {
      const { results } = await abortMutation.mutateAsync(pendingAbort);
      const failed = results.filter((r: AbortResult) => !r.success);
      const ok = results.length - failed.length;

      if (ok > 0) {
        addNotification({
          type: "delete",
          title: "Uploads aborted",
          description: `Aborted ${ok} incomplete upload${ok === 1 ? "" : "s"}.`,
          status: "completed",
        });
      }
      for (const f of failed) {
        addNotification({
          type: "error",
          title: "Abort failed",
          error: `${f.key}: ${f.error ?? "Unknown error"}`,
          status: "error",
        });
      }
      setSelected(new Set());
      setPendingAbort(null);
    } catch (err) {
      addNotification({
        type: "error",
        title: "Abort failed",
        error: err instanceof Error ? err.message : "Unknown error",
        status: "error",
      });
      setPendingAbort(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-3" />
        <p className="text-sm text-muted-foreground mb-4">
          {(error as Error).message}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (sortedUploads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
        <h3 className="text-lg font-semibold mb-1">All clear</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          No incomplete uploads found. These occur when a multipart upload is
          interrupted; S3 keeps the partial data and bills you for it until
          someone cleans it up.
        </p>
      </div>
    );
  }

  const selectedUploads = sortedUploads.filter((u) =>
    selected.has(rowKey(u.key, u.uploadId))
  );

  return (
    <div className="space-y-4">
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-background/95 backdrop-blur border rounded-md px-4 py-2">
          <span className="text-sm">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canAbort}
              title={!canAbort ? "You don't have permission to abort uploads for this connection" : undefined}
              onClick={() =>
                setPendingAbort(
                  selectedUploads.map((u) => ({ key: u.key, uploadId: u.uploadId }))
                )
              }
            >
              <Trash2 className="h-4 w-4" />
              Abort selected
            </Button>
          </div>
        </div>
      )}

      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="p-3">Key</th>
              <th className="p-3">Initiated</th>
              <th className="p-3">Storage class</th>
              <th className="p-3">Initiator</th>
              <th className="p-3 w-32 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedUploads.map((u) => {
              const id = rowKey(u.key, u.uploadId);
              const isSelected = selected.has(id);
              return (
                <tr key={id} className="border-t hover:bg-muted/20">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(u.key, u.uploadId)}
                      aria-label={`Select ${u.key}`}
                    />
                  </td>
                  <td className="p-3 font-mono text-xs">
                    <span className="block truncate max-w-xs" title={u.key}>
                      {u.key}
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <div>{formatDate(u.initiated)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatRelativeAge(u.initiated)}
                    </div>
                  </td>
                  <td className="p-3 text-xs uppercase">{u.storageClass ?? "—"}</td>
                  <td className="p-3 text-xs">{formatInitiator(u)}</td>
                  <td className="p-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canAbort}
                      title={!canAbort ? "You don't have permission to abort uploads for this connection" : undefined}
                      onClick={() =>
                        setPendingAbort([{ key: u.key, uploadId: u.uploadId }])
                      }
                    >
                      Abort
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AbortUploadsDialog
        open={pendingAbort !== null}
        count={pendingAbort?.length ?? 0}
        isPending={abortMutation.isPending}
        onConfirm={handleConfirmAbort}
        onCancel={() => setPendingAbort(null)}
      />
    </div>
  );
}
