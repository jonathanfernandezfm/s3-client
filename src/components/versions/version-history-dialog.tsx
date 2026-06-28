"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useVersionHistoryDialogStore } from "@/lib/stores/version-history-dialog-store";
import {
  useObjectVersions,
  useRestoreVersion,
  useUndeleteVersion,
  usePurgeVersion,
  useVersionPresignUrl,
  useCopyVersion,
} from "@/lib/queries/versions";
import {
  DestinationPickerDialog,
  type Destination,
} from "@/components/browser/destination-picker-dialog";
import { useBucketVersioning } from "@/lib/queries/buckets";
import { canDiff } from "@/lib/versions/can-diff";
import { formatBytes, getFileExtension, cn } from "@/lib/utils";
import { formatRelativeTime } from "@/components/info-drawer/format-time";
import { useNotificationStore } from "@/lib/stores/notification-store";
import type { S3ObjectVersion } from "@/types/s3";
import { History, Trash2, Download, Copy as CopyIcon, MoreHorizontal, X } from "lucide-react";
import { diffLines } from "diff";

export function VersionHistoryDialog() {
  const { isOpen, target, selectedVersionId, diffSelection, close, selectVersion, toggleDiffSelection } =
    useVersionHistoryDialogStore();

  const connectionId = target?.connectionId ?? "";
  const bucket = target?.bucket ?? "";
  const key = target?.key ?? "";

  const versioning = useBucketVersioning(connectionId, bucket);
  const versions = useObjectVersions(
    { connectionId, bucket, key },
    { enabled: isOpen && (versioning.data?.status === "Enabled" || versioning.data?.status === "Suspended") },
  );

  const list = versions.data?.versions ?? [];

  // Auto-select the latest version when the dialog opens with nothing pre-selected
  useEffect(() => {
    if (isOpen && !selectedVersionId && list.length > 0) {
      selectVersion(list[0].versionId);
    }
  }, [isOpen, selectedVersionId, list, selectVersion]);

  const selected = useMemo(
    () => versions.data?.versions.find((v) => v.versionId === selectedVersionId) ?? null,
    [versions.data, selectedVersionId],
  );

  const diffCandidates = useMemo(() => {
    if (!versions.data) return [];
    return diffSelection
      .map((id) => versions.data!.versions.find((v) => v.versionId === id))
      .filter((v): v is S3ObjectVersion => !!v);
  }, [versions.data, diffSelection]);

  const diffGuard = canDiff(
    diffCandidates.map((v) => ({
      key: v.key,
      versionId: v.versionId,
      isDeleteMarker: v.isDeleteMarker,
      size: v.size,
      contentType: extensionToContentType(getFileExtension(v.key)),
    })),
  );

  const showingDiff = diffGuard.ok;

  if (!target) {
    return (
      <Dialog open={isOpen} onOpenChange={(o) => !o && close()}>
        <DialogContent />
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-5xl w-[90vw] h-[80vh] p-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-sm truncate">{key} — Version history</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Left rail */}
          <div className="w-[280px] border-r flex flex-col">
            {list.length === 0 && !versions.isLoading && (
              <div className="p-4 text-xs text-muted-foreground">No older versions yet.</div>
            )}
            <div className="overflow-y-auto flex-1">
              {list.map((v) => (
                <VersionListRow
                  key={v.versionId}
                  v={v}
                  selected={v.versionId === selectedVersionId}
                  checked={diffSelection.includes(v.versionId)}
                  onSelect={() => selectVersion(v.versionId)}
                  onToggle={() => toggleDiffSelection(v.versionId)}
                />
              ))}
            </div>
            {diffSelection.length > 0 && (
              <div className="p-2 border-t text-[11px] flex items-center justify-between">
                <span>Diff: {diffSelection.length}/2 selected</span>
                {diffSelection.length === 2 && !diffGuard.ok && (
                  <span className="text-muted-foreground" title={diffGuard.reason}>can&apos;t diff</span>
                )}
              </div>
            )}
          </div>

          {/* Right pane */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-auto">
              {showingDiff && diffCandidates.length === 2 ? (
                <DiffView
                  connectionId={connectionId}
                  bucket={bucket}
                  a={diffCandidates[0]}
                  b={diffCandidates[1]}
                />
              ) : selected ? (
                <PreviewPane
                  connectionId={connectionId}
                  bucket={bucket}
                  version={selected}
                />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">Select a version on the left.</div>
              )}
            </div>

            {selected && (
              <ActionBar
                connectionId={connectionId}
                bucket={bucket}
                version={selected}
                onClose={close}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VersionListRow({
  v,
  selected,
  checked,
  onSelect,
  onToggle,
}: {
  v: S3ObjectVersion;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-muted text-xs border-b",
        selected && "bg-muted",
      )}
      onClick={onSelect}
    >
      <input
        type="checkbox"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggle}
        disabled={v.isDeleteMarker}
        title={v.isDeleteMarker ? "Delete markers cannot be diffed" : "Select for diff"}
      />
      {v.isDeleteMarker ? (
        <Trash2 className="h-3 w-3 text-destructive shrink-0" />
      ) : (
        <History className="h-3 w-3 text-muted-foreground shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          {v.isLatest && (
            <span className="text-[10px] uppercase font-semibold text-primary">Current</span>
          )}
          {v.isDeleteMarker && (
            <span className="text-[10px] uppercase font-semibold text-destructive">Deleted</span>
          )}
        </div>
        <div className="text-muted-foreground truncate">
          {v.lastModified ? formatRelativeTime(v.lastModified) : "—"}
          {v.size !== undefined && ` · ${formatBytes(v.size)}`}
        </div>
      </div>
    </div>
  );
}

function PreviewPane({
  connectionId,
  bucket,
  version,
}: {
  connectionId: string;
  bucket: string;
  version: S3ObjectVersion;
}) {
  const presign = useVersionPresignUrl({
    connectionId,
    bucket,
    key: version.key,
    versionId: version.versionId,
  });
  if (version.isDeleteMarker) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Delete marker. Use Undelete (below) to restore the previous version.
      </div>
    );
  }
  if (presign.isLoading) return <div className="p-6 text-sm">Loading preview…</div>;
  if (presign.error || !presign.data) {
    return <div className="p-6 text-sm text-muted-foreground">Preview unavailable.</div>;
  }
  const ext = getFileExtension(version.key);
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
    return (
      <div className="p-4 flex items-center justify-center h-full">
        <img src={presign.data.url} alt={version.key} className="max-w-full max-h-full" />
      </div>
    );
  }
  return (
    <div className="p-6 text-sm text-muted-foreground">
      Preview not available for this file type.{" "}
      <a className="text-primary underline" href={presign.data.url} target="_blank" rel="noreferrer">
        Open in new tab
      </a>
      .
    </div>
  );
}

function DiffView({
  connectionId,
  bucket,
  a,
  b,
}: {
  connectionId: string;
  bucket: string;
  a: S3ObjectVersion;
  b: S3ObjectVersion;
}) {
  const aUrl = useVersionPresignUrl({ connectionId, bucket, key: a.key, versionId: a.versionId });
  const bUrl = useVersionPresignUrl({ connectionId, bucket, key: b.key, versionId: b.versionId });
  const [aText, setAText] = useState<string | null>(null);
  const [bText, setBText] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    setAText(null);
    setBText(null);

    async function fetchTexts() {
      if (aUrl.data?.url) {
        try {
          const res = await fetch(aUrl.data.url, { signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          setAText(await res.text());
        } catch (err) {
          if ((err as Error).name !== "AbortError") setAText("(failed to load this version)");
        }
      }
      if (bUrl.data?.url) {
        try {
          const res = await fetch(bUrl.data.url, { signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          setBText(await res.text());
        } catch (err) {
          if ((err as Error).name !== "AbortError") setBText("(failed to load this version)");
        }
      }
    }

    fetchTexts();

    return () => controller.abort();
  }, [aUrl.data?.url, bUrl.data?.url]);

  if (aText === null || bText === null) {
    return <div className="p-6 text-sm">Loading diff…</div>;
  }

  const parts = diffLines(aText, bText);
  return (
    <pre className="font-mono text-xs whitespace-pre-wrap p-4">
      {parts.map((p, i) => (
        <span
          key={i}
          className={cn(
            p.added && "bg-green-500/20",
            p.removed && "bg-red-500/20",
          )}
        >
          {p.value}
        </span>
      ))}
    </pre>
  );
}

function ActionBar({
  connectionId,
  bucket,
  version,
  onClose,
}: {
  connectionId: string;
  bucket: string;
  version: S3ObjectVersion;
  onClose: () => void;
}) {
  const restore = useRestoreVersion();
  const undelete = useUndeleteVersion();
  const purge = usePurgeVersion();
  const copyVersion = useCopyVersion();
  const presign = useVersionPresignUrl(
    { connectionId, bucket, key: version.key, versionId: version.versionId },
    { enabled: !version.isDeleteMarker },
  );
  const addNotification = useNotificationStore((s) => s.addNotification);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [showCopyTo, setShowCopyTo] = useState(false);

  if (version.isDeleteMarker) {
    return (
      <div className="p-3 border-t flex items-center gap-2">
        <Button
          size="sm"
          onClick={() =>
            undelete.mutate(
              {
                connectionId,
                bucket,
                key: version.key,
                deleteMarkerVersionId: version.versionId,
              },
              {
                onSuccess: () => {
                  addNotification({ type: "info", title: "Restored deleted file.", status: "completed" });
                  onClose();
                },
                onError: (e) => addNotification({ type: "error", title: "Undelete failed", error: (e as Error).message, status: "error" }),
              },
            )
          }
          disabled={undelete.isPending}
        >
          Undelete
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="p-3 border-t flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            if (version.isLatest) {
              addNotification({ type: "info", title: "This is already the current version.", status: "completed" });
              return;
            }
            restore.mutate(
              {
                connectionId,
                bucket,
                key: version.key,
                versionId: version.versionId,
              },
              {
                onSuccess: () => {
                  addNotification({ type: "info", title: `Restored ${version.key} to selected version.`, status: "completed" });
                  onClose();
                },
                onError: (e) =>
                  addNotification({ type: "error", title: "Restore failed", error: (e as Error).message, status: "error" }),
              },
            );
          }}
          disabled={restore.isPending || version.isLatest}
        >
          Restore
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => presign.data?.url && window.open(presign.data.url, "_blank")}
          disabled={!presign.data?.url}
        >
          <Download className="h-3 w-3 mr-1" />
          Download
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowCopyTo(true)}
          disabled={copyVersion.isPending}
        >
          <CopyIcon className="h-3 w-3 mr-1" />
          Copy to…
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => setShowPurgeConfirm(true)}
          disabled={version.isLatest}
          title={version.isLatest ? "Cannot purge the current version" : "Delete forever (admin)"}
        >
          <MoreHorizontal className="h-3 w-3 mr-1" />
          Delete forever
        </Button>
      </div>

      {showPurgeConfirm && (
        <PurgeConfirm
          fileName={version.key.split("/").pop() || version.key}
          onCancel={() => setShowPurgeConfirm(false)}
          onConfirm={() =>
            purge.mutate(
              { connectionId, bucket, key: version.key, versionId: version.versionId },
              {
                onSuccess: () => {
                  addNotification({ type: "delete", title: "Version permanently deleted.", status: "completed" });
                  setShowPurgeConfirm(false);
                },
                onError: (e) =>
                  addNotification({ type: "error", title: "Purge failed", error: (e as Error).message, status: "error" }),
              },
            )
          }
          loading={purge.isPending}
        />
      )}

      <DestinationPickerDialog
        open={showCopyTo}
        mode="copy"
        count={1}
        defaultConnectionId={connectionId}
        defaultBucket={bucket}
        onCancel={() => setShowCopyTo(false)}
        onConfirm={(dest: Destination) => {
          const filename = version.key.split("/").pop() || version.key;
          const targetKey = dest.path + filename;
          copyVersion.mutate(
            {
              connectionId,
              bucket,
              key: version.key,
              versionId: version.versionId,
              targetConnectionId: dest.connectionId,
              targetBucket: dest.bucket,
              targetKey,
            },
            {
              onSuccess: () => {
                addNotification({ type: "info", title: `Copied version to ${targetKey}.`, status: "completed" });
                setShowCopyTo(false);
              },
              onError: (e) =>
                addNotification({ type: "error", title: "Copy failed", error: (e as Error).message, status: "error" }),
            },
          );
        }}
      />
    </>
  );
}

function PurgeConfirm({
  fileName,
  onCancel,
  onConfirm,
  loading,
}: {
  fileName: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const [typed, setTyped] = useState("");
  const canConfirm = typed === fileName && !loading;
  return (
    <div className="absolute inset-0 bg-background/80 flex items-center justify-center p-6">
      <div className="bg-background border rounded-lg p-4 w-[420px] shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Permanently delete this version?</h3>
          <button onClick={onCancel}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          This cannot be undone. Type <code className="font-mono">{fileName}</code> to confirm.
        </p>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm font-mono"
          placeholder={fileName}
        />
        <div className="flex gap-2 justify-end mt-3">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" disabled={!canConfirm} onClick={onConfirm}>
            Delete forever
          </Button>
        </div>
      </div>
    </div>
  );
}

function extensionToContentType(ext: string): string | undefined {
  const lower = ext.toLowerCase();
  if (["txt", "md", "csv", "log"].includes(lower)) return "text/plain";
  if (lower === "json") return "application/json";
  if (lower === "html" || lower === "htm") return "text/html";
  if (lower === "css") return "text/css";
  if (["js", "ts", "tsx", "jsx"].includes(lower)) return "text/javascript";
  return undefined;
}
