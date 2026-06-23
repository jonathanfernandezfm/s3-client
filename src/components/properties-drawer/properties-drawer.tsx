"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { usePropertiesDrawerStore } from "@/lib/stores/properties-drawer-store";
import { useObjectHead, useUpdateObjectMetadata, useRestoreObject } from "@/lib/queries/objects";
import { useConnections } from "@/lib/queries/connections";
import { useBucketVersioning } from "@/lib/queries/buckets";
import { canManageFiles } from "@/lib/roles";
import { formatBytes, formatDate } from "@/lib/utils";
import type { ObjectProperties } from "@/types";

const CONTENT_TYPE_SUGGESTIONS = [
  "application/json",
  "application/octet-stream",
  "application/pdf",
  "application/zip",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "text/css",
  "text/csv",
  "text/html",
  "text/javascript",
  "text/plain",
  "video/mp4",
];

const STORAGE_CLASSES = [
  "STANDARD",
  "STANDARD_IA",
  "ONEZONE_IA",
  "INTELLIGENT_TIERING",
  "GLACIER_IR",
  "GLACIER",
  "DEEP_ARCHIVE",
  "REDUCED_REDUNDANCY",
];

const MAX_COPY_SIZE = 5 * 1024 * 1024 * 1024;

function sseLabel(p: ObjectProperties): string {
  if (!p.serverSideEncryption) return "None";
  if (p.serverSideEncryption === "AES256") return "SSE-S3 (AES256)";
  if (p.serverSideEncryption === "aws:kms")
    return `SSE-KMS${p.sseKmsKeyId ? ` · …${p.sseKmsKeyId.slice(-12)}` : ""}`;
  return p.serverSideEncryption;
}

export function PropertiesDrawer() {
  const { isOpen, scope, close } = usePropertiesDrawerStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const connectionId = scope?.connectionId ?? "";
  const bucket = scope?.bucket ?? "";
  const objectKey = scope?.objectKey ?? "";
  const fileName = objectKey.split("/").filter(Boolean).pop() ?? objectKey;

  const head = useObjectHead(
    isOpen ? connectionId : "",
    isOpen ? bucket : "",
    isOpen ? objectKey : ""
  );
  const { data: connections = [] } = useConnections();
  const connection = connections.find((c) => c.id === connectionId);
  const canWrite = canManageFiles(connection?.role ?? null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen) {
      // remember where focus was so we can restore it on close
      lastFocusedRef.current = document.activeElement as HTMLElement | null;
      // move focus into the drawer
      panelRef.current?.focus({ preventScroll: true });
    } else {
      // restore focus to the trigger when closing
      lastFocusedRef.current?.focus?.({ preventScroll: true });
      lastFocusedRef.current = null;
    }
  }, [isOpen]);

  return (
    <>
      {isOpen && (
        <div
          aria-hidden
          style={{ position: "fixed", inset: 0, zIndex: 39 }}
          onClick={close}
        />
      )}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="properties-drawer-title"
        aria-hidden={!isOpen}
        tabIndex={-1}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: 380,
          zIndex: 40,
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
          pointerEvents: isOpen ? "auto" : "none",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        className="bg-background border-l border-border shadow-xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <h2 id="properties-drawer-title" className="text-sm font-semibold">Properties</h2>
            </div>
            {fileName && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[260px]">
                {fileName}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={close}
            title="Close"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Body */}
        {!objectKey ? null : head.isLoading ? (
          <div className="p-4 text-xs text-muted-foreground">
            Loading properties…
          </div>
        ) : head.isError || !head.data ? (
          <div className="p-4 text-xs text-destructive">
            {head.error instanceof Error
              ? head.error.message
              : "Failed to load properties"}
          </div>
        ) : (
          <PropertiesForm
            key={`${objectKey}:${head.data.etag ?? ""}`}
            connectionId={connectionId}
            bucket={bucket}
            objectKey={objectKey}
            properties={head.data}
            canWrite={canWrite}
          />
        )}
      </div>
    </>
  );
}

type MetadataRow = { id: number; key: string; value: string };

function PropertiesForm({
  connectionId,
  bucket,
  objectKey,
  properties,
  canWrite,
}: {
  connectionId: string;
  bucket: string;
  objectKey: string;
  properties: ObjectProperties;
  canWrite: boolean;
}) {
  const addNotification = useNotificationStore((s) => s.addNotification);
  const updateMetadata = useUpdateObjectMetadata();
  const restore = useRestoreObject();
  const versioning = useBucketVersioning(connectionId, bucket);
  const versioningEnabled = versioning.data?.status === "Enabled";

  const nextRowId = useRef(0);
  const [contentType, setContentType] = useState(properties.contentType ?? "");
  const [cacheControl, setCacheControl] = useState(
    properties.cacheControl ?? ""
  );
  const [storageClass, setStorageClass] = useState(properties.storageClass);
  // eslint-disable-next-line react-hooks/refs -- nextRowId.current is read inside useState lazy initializer (runs once at mount, not during re-renders); safe to read here, real fix tracked separately
  const [rows, setRows] = useState<MetadataRow[]>(() =>
    Object.entries(properties.metadata).map(([key, value]) => ({
      id: nextRowId.current++,
      key,
      value,
    }))
  );

  const restored =
    properties.restore?.includes('ongoing-request="false"') ?? false;
  const restoreInProgress =
    properties.restore?.includes('ongoing-request="true"') ?? false;
  const archived =
    (properties.storageClass === "GLACIER" ||
      properties.storageClass === "DEEP_ARCHIVE") &&
    !restored;
  const tooLarge = (properties.size ?? 0) > MAX_COPY_SIZE;
  const blockedReason = tooLarge
    ? "Objects larger than 5 GB cannot be edited in place."
    : archived
    ? "Restore this archived object before editing its metadata."
    : null;
  const editable = canWrite && !blockedReason;

  const initialMetadata = JSON.stringify(
    Object.entries(properties.metadata).sort()
  );
  const currentMetadata = JSON.stringify(
    rows
      .filter((r) => r.key.trim() !== "")
      .map((r) => [r.key.trim().toLowerCase(), r.value])
      .sort()
  );
  const isDirty =
    contentType !== (properties.contentType ?? "") ||
    cacheControl !== (properties.cacheControl ?? "") ||
    storageClass !== properties.storageClass ||
    currentMetadata !== initialMetadata;

  async function handleSave() {
    const metadata: Record<string, string> = {};
    for (const row of rows) {
      const key = row.key.trim().toLowerCase();
      if (!key) continue;
      if (key in metadata) {
        addNotification({
          type: "error",
          title: "Duplicate metadata key",
          error: `"${key}" appears more than once.`,
          status: "error",
        });
        return;
      }
      metadata[key] = row.value;
    }

    try {
      await updateMetadata.mutateAsync({
        connectionId,
        bucket,
        key: objectKey,
        contentType,
        cacheControl,
        metadata,
        storageClass,
      });
      addNotification({ type: "info", title: "Properties saved", status: "completed" });
    } catch (err) {
      addNotification({
        type: "error",
        title: "Couldn't save properties",
        error: err instanceof Error ? err.message : "Unknown error",
        status: "error",
      });
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 py-3 border-b border-border">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Size</dt>
          <dd>
            {properties.size !== undefined
              ? formatBytes(properties.size)
              : "—"}
          </dd>
          <dt className="text-muted-foreground">Modified</dt>
          <dd>
            {properties.lastModified
              ? formatDate(properties.lastModified)
              : "—"}
          </dd>
          <dt className="text-muted-foreground">ETag</dt>
          <dd className="truncate font-mono">{properties.etag ?? "—"}</dd>
          {properties.versionId && (
            <>
              <dt className="text-muted-foreground">Version</dt>
              <dd className="truncate font-mono">{properties.versionId}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Encryption</dt>
          <dd>{sseLabel(properties)}</dd>
        </dl>
      </div>

      <div className="px-4 py-3 flex flex-col gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Content-Type</span>
          <Input
            list="pd-content-type-suggestions"
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
            disabled={!editable}
            className="h-8 text-xs"
            placeholder="application/octet-stream"
          />
          <datalist id="pd-content-type-suggestions">
            {CONTENT_TYPE_SUGGESTIONS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Cache-Control</span>
          <Input
            value={cacheControl}
            onChange={(e) => setCacheControl(e.target.value)}
            disabled={!editable}
            className="h-8 text-xs"
            placeholder="public, max-age=31536000"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Storage class</span>
          <select
            value={storageClass}
            onChange={(e) => setStorageClass(e.target.value)}
            disabled={!editable}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            {!STORAGE_CLASSES.includes(storageClass) && (
              <option value={storageClass}>{storageClass}</option>
            )}
            {STORAGE_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Custom metadata</span>
            {editable && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() =>
                  setRows((prev) => [
                    ...prev,
                    { id: nextRowId.current++, key: "", value: "" },
                  ])
                }
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            )}
          </div>
          {rows.length === 0 && (
            <p className="text-muted-foreground">No custom metadata.</p>
          )}
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-1">
              <Input
                value={row.key}
                placeholder="key"
                disabled={!editable}
                className="h-7 text-xs flex-1"
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, key: e.target.value } : r
                    )
                  )
                }
              />
              <Input
                value={row.value}
                placeholder="value"
                disabled={!editable}
                className="h-7 text-xs flex-[2]"
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, value: e.target.value } : r
                    )
                  )
                }
              />
              {editable && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() =>
                    setRows((prev) => prev.filter((r) => r.id !== row.id))
                  }
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {blockedReason && (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground">{blockedReason}</p>
            {archived && (
              <Button
                size="sm"
                variant="outline"
                disabled={!canWrite || restoreInProgress || restore.isPending}
                onClick={async () => {
                  try {
                    const res = await restore.mutateAsync({
                      connectionId,
                      bucket,
                      key: objectKey,
                    });
                    addNotification({
                      type: "info",
                      title: res.status === "in-progress" ? "Restore already in progress" : "Restore initiated",
                      description: "Archived objects take minutes to hours to become available. Re-open this panel to check status.",
                      status: "completed",
                    });
                  } catch (err) {
                    addNotification({
                      type: "error",
                      title: "Couldn't start restore",
                      error: err instanceof Error ? err.message : "Unknown error",
                      status: "error",
                    });
                  }
                }}
              >
                {restoreInProgress ? "Restoring…" : "Restore"}
              </Button>
            )}
          </div>
        )}
        {editable && versioningEnabled && (
          <p className="text-muted-foreground">
            Saving rewrites the object and creates a new version.
          </p>
        )}
        {editable && (
          <Button
            size="sm"
            className="self-start h-7 px-3 text-xs"
            disabled={!isDirty || updateMetadata.isPending}
            onClick={handleSave}
          >
            {updateMetadata.isPending && (
              <Loader2 className="h-3 w-3 animate-spin" />
            )}
            Save changes
          </Button>
        )}
      </div>
    </div>
  );
}
