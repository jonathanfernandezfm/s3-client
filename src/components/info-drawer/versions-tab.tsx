"use client";

import { useState } from "react";
import { useInfoDrawerStore } from "@/lib/stores/info-drawer-store";
import { useBucketVersioning } from "@/lib/queries/buckets";
import { useObjectVersions } from "@/lib/queries/versions";
import { useVersionHistoryDialogStore } from "@/lib/stores/version-history-dialog-store";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";
import { formatRelativeTime } from "./format-time";
import type { S3ObjectVersion } from "@/types/s3";
import Link from "next/link";
import { ChevronDown, ChevronRight, Trash2, History } from "lucide-react";

type Filter = "all" | "deleted" | "older";

export function VersionsTab() {
  const { scope } = useInfoDrawerStore();
  const openDialog = useVersionHistoryDialogStore((s) => s.open);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const connectionId = scope?.connectionId ?? "";
  const bucket = scope?.bucket ?? "";
  const versioning = useBucketVersioning(connectionId, bucket);

  const hasVersioning =
    versioning.data?.status === "Enabled" || versioning.data?.status === "Suspended";

  const versions = useObjectVersions(
    {
      connectionId,
      bucket,
      prefix: scope?.objectKey ? undefined : scope?.prefix,
      key: scope?.objectKey,
    },
    { enabled: hasVersioning },
  );

  if (!scope?.connectionId || !scope?.bucket) {
    return <div className="p-4 text-xs text-muted-foreground">Select a bucket or object to see versions.</div>;
  }

  if (versioning.isLoading) {
    return <div className="p-4 text-xs text-muted-foreground">Loading…</div>;
  }

  if (!hasVersioning) {
    return (
      <div className="p-4 text-xs text-muted-foreground space-y-2">
        <p>Versioning is not enabled for this bucket.</p>
        <Link
          href={`/buckets/${connectionId}/${encodeURIComponent(bucket)}?tab=overview`}
          className="inline-flex items-center gap-1 text-foreground underline underline-offset-2 hover:opacity-70"
        >
          Enable versioning in bucket settings
        </Link>
      </div>
    );
  }

  if (versions.isLoading) {
    return <div className="p-4 text-xs text-muted-foreground">Loading versions…</div>;
  }

  const all = versions.data?.versions ?? [];
  const filtered =
    filter === "all"
      ? all
      : filter === "deleted"
      ? all.filter((v) => v.isDeleteMarker)
      : all.filter((v) => !v.isLatest && !v.isDeleteMarker);

  const filterChips = (
    <div className="flex gap-1 text-xs">
      <FilterChip label="All" active={filter === "all"} onClick={() => setFilter("all")} />
      <FilterChip label="Deleted only" active={filter === "deleted"} onClick={() => setFilter("deleted")} />
      <FilterChip label="Older versions" active={filter === "older"} onClick={() => setFilter("older")} />
    </div>
  );

  const emptyState = (
    <div className="text-xs text-muted-foreground">No versions match this filter.</div>
  );

  // File scope: flat list
  if (scope.objectKey) {
    return (
      <div className="flex flex-col gap-2 p-3 overflow-y-auto">
        {filterChips}
        {filtered.length === 0 ? emptyState : filtered.map((v) => (
          <VersionRow key={v.versionId} version={v} onOpenDialog={() => openDialog({
            connectionId,
            bucket,
            key: v.key,
          }, { preselectVersionId: v.versionId })} />
        ))}
      </div>
    );
  }

  // Prefix scope: grouped by key
  const byKey = new Map<string, S3ObjectVersion[]>();
  for (const v of filtered) {
    const arr = byKey.get(v.key) ?? [];
    arr.push(v);
    byKey.set(v.key, arr);
  }

  const toggleKey = (k: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-2 p-3 overflow-y-auto">
      {filterChips}
      {filtered.length === 0 ? emptyState : [...byKey.entries()].map(([k, group]) => {
        const expanded = expandedKeys.has(k);
        return (
          <div key={k} className="border rounded">
            <button
              type="button"
              onClick={() => toggleKey(k)}
              className="w-full flex items-center gap-2 px-2 py-1 text-left text-xs hover:bg-muted"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span className="truncate flex-1">{k}</span>
              <span className="text-muted-foreground">{group.length}</span>
            </button>
            {expanded && (
              <div className="flex flex-col gap-1 p-2 border-t">
                {group.map((v) => (
                  <VersionRow key={v.versionId} version={v} onOpenDialog={() => openDialog({
                    connectionId,
                    bucket,
                    key: v.key,
                  }, { preselectVersionId: v.versionId })} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function VersionRow({ version, onOpenDialog }: { version: S3ObjectVersion; onOpenDialog: () => void }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {version.isDeleteMarker ? (
        <Trash2 className="h-3 w-3 text-destructive" />
      ) : (
        <History className="h-3 w-3 text-muted-foreground" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          {version.isLatest && (
            <span className="text-[10px] uppercase font-semibold text-primary">Current</span>
          )}
          {version.isDeleteMarker && (
            <span className="text-[10px] uppercase font-semibold text-destructive">Deleted</span>
          )}
          <span className="text-muted-foreground truncate">
            {version.lastModified ? formatRelativeTime(version.lastModified) : "—"}
            {version.size !== undefined && ` · ${formatBytes(version.size)}`}
          </span>
        </div>
      </div>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={onOpenDialog}>
        Open
      </Button>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 rounded border text-[11px] ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-transparent hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}
