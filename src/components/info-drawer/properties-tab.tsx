"use client";

import { useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useInfoDrawerStore } from "@/lib/stores/info-drawer-store";
import { useObjectHead, useUpdateObjectMetadata } from "@/lib/queries/objects";
import { useConnections } from "@/lib/queries/connections";
import { useBucketVersioning } from "@/lib/queries/buckets";
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

export function PropertiesTab() {
  const { scope } = useInfoDrawerStore();
  const connectionId = scope?.connectionId ?? "";
  const bucket = scope?.bucket ?? "";
  const objectKey = scope?.objectKey ?? "";

  const head = useObjectHead(connectionId, bucket, objectKey);
  const { data: connections = [] } = useConnections();
  const connection = connections.find((c) => c.id === connectionId);
  const canWrite = connection?.role === "ADMIN" ?? false;

  if (!objectKey) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select a file and choose Properties to view its metadata.
      </div>
    );
  }

  if (head.isLoading) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Loading properties…
      </div>
    );
  }

  if (head.isError || !head.data) {
    return (
      <div className="p-4 text-xs text-destructive">
        {head.error instanceof Error
          ? head.error.message
          : "Failed to load properties"}
      </div>
    );
  }

  return (
    <PropertiesForm
      key={`${objectKey}:${head.data.etag ?? ""}`}
      connectionId={connectionId}
      bucket={bucket}
      objectKey={objectKey}
      properties={head.data}
      canWrite={canWrite}
    />
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
  const { toast } = useToast();
  const updateMetadata = useUpdateObjectMetadata();
  const versioning = useBucketVersioning(connectionId, bucket);
  const versioningEnabled = versioning.data?.status === "Enabled";

  const nextRowId = useRef(0);
  const [contentType, setContentType] = useState(properties.contentType ?? "");
  const [cacheControl, setCacheControl] = useState(
    properties.cacheControl ?? ""
  );
  const [storageClass, setStorageClass] = useState(properties.storageClass);
  const [rows, setRows] = useState<MetadataRow[]>(() =>
    Object.entries(properties.metadata).map(([key, value]) => ({
      id: nextRowId.current++,
      key,
      value,
    }))
  );

  const restored =
    properties.restore?.includes('ongoing-request="false"') ?? false;
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
        toast({
          title: "Duplicate metadata key",
          description: `"${key}" appears more than once.`,
          variant: "destructive",
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
      toast({ title: "Properties saved" });
    } catch (err) {
      toast({
        title: "Couldn't save properties",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
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
            list="content-type-suggestions"
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
            disabled={!editable}
            className="h-8 text-xs"
            placeholder="application/octet-stream"
          />
          <datalist id="content-type-suggestions">
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
          <p className="text-muted-foreground">{blockedReason}</p>
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
