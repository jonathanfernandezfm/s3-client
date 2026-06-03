"use client";

import { useState, useEffect } from "react";
import {
  X,
  RefreshCw,
  ChevronDown,
  Activity,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActivityDrawerStore } from "@/lib/stores/activity-drawer-store";
import { useActivity } from "@/lib/queries/activity";
import { groupActivityEvents } from "./batch-grouping";
import type { ActivityRow, BatchRow, SingleRow } from "./batch-grouping";
import type { ActivityEventResponse } from "@/lib/queries/activity";
import type { ActivityAction } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Props kept for forward compatibility but scope is read from the store
export type ActivityDrawerProps = Record<string, never>;

// ---------------------------------------------------------------------------
// Timestamp helper
// ---------------------------------------------------------------------------

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;

  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Avatar helper
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-pink-500",
  "bg-orange-500",
];

function hashColor(userId: string | null): string {
  if (!userId) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({
  userId,
  displayName,
  imageUrl,
  size = 24,
}: {
  userId: string | null;
  displayName: string;
  imageUrl: string | null;
  size?: number;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={displayName}
        width={size}
        height={size}
        className="rounded-full shrink-0 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const color = hashColor(userId);
  return (
    <span
      className={`${color} rounded-full shrink-0 flex items-center justify-center text-white font-semibold select-none`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(displayName)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Action verb + target helpers
// ---------------------------------------------------------------------------

const ACTION_VERBS: Record<ActivityAction, string> = {
  UPLOAD: "uploaded",
  DELETE: "deleted",
  COPY: "copied",
  MOVE: "moved",
  RENAME: "renamed",
  FOLDER_CREATE: "created folder",
  TAG_CHANGE: "updated tags on",
  BUCKET_CREATE: "created bucket",
  BUCKET_DELETE: "deleted bucket",
};

const ALL_ACTIONS: ActivityAction[] = [
  "UPLOAD",
  "DELETE",
  "COPY",
  "MOVE",
  "RENAME",
  "FOLDER_CREATE",
  "TAG_CHANGE",
  "BUCKET_CREATE",
  "BUCKET_DELETE",
];

const ACTION_LABELS: Record<ActivityAction, string> = {
  UPLOAD: "Upload",
  DELETE: "Delete",
  COPY: "Copy",
  MOVE: "Move",
  RENAME: "Rename",
  FOLDER_CREATE: "Folder create",
  TAG_CHANGE: "Tag change",
  BUCKET_CREATE: "Bucket create",
  BUCKET_DELETE: "Bucket delete",
};

function lastSegment(path: string): string {
  const trimmed = path.replace(/\/$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

function parentPath(path: string): string {
  const trimmed = path.replace(/\/$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? "" : trimmed.slice(0, idx + 1);
}

function eventTarget(event: ActivityEventResponse): string {
  const { action, key, targetKey, bucket } = event;
  if (!key) return bucket;

  if ((action === "RENAME" || action === "MOVE") && targetKey) {
    return `${lastSegment(key)} → ${lastSegment(targetKey)}`;
  }

  return lastSegment(key);
}

function eventParentPath(event: ActivityEventResponse): string | null {
  if (!event.key) return null;
  return parentPath(event.key) || null;
}

// ---------------------------------------------------------------------------
// Single row
// ---------------------------------------------------------------------------

function SingleRowItem({ event }: { event: ActivityEventResponse }) {
  const verb = ACTION_VERBS[event.action];
  const target = eventTarget(event);
  const parent = eventParentPath(event);
  const ts = formatRelativeTime(event.createdAt);

  return (
    <div className="flex items-start gap-2 px-4 py-3 hover:bg-accent/40 transition-colors min-h-[52px]">
      <div className="mt-0.5">
        <Avatar
          userId={event.userId}
          displayName={event.userDisplayName}
          imageUrl={event.userImageUrl}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">
          <span className="font-medium">{event.userDisplayName}</span>{" "}
          <span className="text-muted-foreground">{verb}</span>{" "}
          <span className="font-medium truncate">{target}</span>
        </p>
        {parent && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            in {parent}
          </p>
        )}
      </div>
      <time
        className="text-xs text-muted-foreground shrink-0 mt-0.5"
        title={new Date(event.createdAt).toISOString()}
      >
        {ts}
      </time>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Batch row
// ---------------------------------------------------------------------------

function BatchRowItem({ row }: { row: BatchRow }) {
  const [expanded, setExpanded] = useState(row.isExpanded);
  const verb = ACTION_VERBS[row.action];
  const ts = formatRelativeTime(row.createdAt);

  // Find common parent for the batch summary
  const firstKey = row.children[0]?.key;
  const batchParent = firstKey ? parentPath(firstKey) || row.bucket : row.bucket;

  return (
    <div>
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-2 px-4 py-3 hover:bg-accent/40 transition-colors min-h-[52px] text-left"
      >
        <div className="mt-0.5">
          <Avatar
            userId={row.userId}
            displayName={row.userDisplayName}
            imageUrl={row.userImageUrl}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-snug">
            <span className="font-medium">{row.userDisplayName}</span>{" "}
            <span className="text-muted-foreground">{verb}</span>{" "}
            <span className="font-medium">{row.count} files</span>
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            in {batchParent}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <time
            className="text-xs text-muted-foreground"
            title={new Date(row.createdAt).toISOString()}
          >
            {ts}
          </time>
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* Expanded children */}
      {expanded && (
        <div className="border-l border-border ml-9">
          {row.children.map((child) => (
            <div
              key={child.id}
              className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-accent/30 transition-colors"
            >
              <span className="text-xs text-foreground truncate">
                {child.key ? lastSegment(child.key) : child.bucket}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row dispatcher
// ---------------------------------------------------------------------------

function ActivityRowItem({ row }: { row: ActivityRow }) {
  if (row.type === "single") return <SingleRowItem event={row.event} />;
  return <BatchRowItem row={row} />;
}

// ---------------------------------------------------------------------------
// Filter strip
// ---------------------------------------------------------------------------

function FilterStrip({
  events,
  userFilter,
  actionFilter,
  setUserFilter,
  setActionFilter,
}: {
  events: ActivityEventResponse[];
  userFilter: string | null;
  actionFilter: ActivityAction[];
  setUserFilter: (v: string | null) => void;
  setActionFilter: (v: ActivityAction[]) => void;
}) {
  // Derive unique users
  const userMap = new Map<string, string>(); // userId -> displayName
  for (const e of events) {
    if (e.userId) userMap.set(e.userId, e.userDisplayName);
  }
  const users = Array.from(userMap.entries());

  // Toggle a single action in the filter list
  function toggleAction(action: ActivityAction) {
    if (actionFilter.length === 0) {
      // "all" → select all except this one
      setActionFilter(ALL_ACTIONS.filter((a) => a !== action));
    } else if (actionFilter.includes(action)) {
      const next = actionFilter.filter((a) => a !== action);
      // If we'd deselect everything, revert to "all"
      setActionFilter(next.length === 0 ? [] : next);
    } else {
      const next = [...actionFilter, action];
      setActionFilter(next.length === ALL_ACTIONS.length ? [] : next);
    }
  }

  return (
    <div className="border-b border-border px-4 py-2 space-y-2">
      {/* User filter */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground shrink-0">User</label>
        <select
          value={userFilter ?? ""}
          onChange={(e) => setUserFilter(e.target.value || null)}
          className="flex-1 text-xs h-7 rounded border border-input bg-background px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All users</option>
          {users.map(([uid, name]) => (
            <option key={uid} value={uid}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Action filter */}
      <div>
        <div className="text-xs text-muted-foreground mb-1.5">Actions</div>
        <div className="flex flex-wrap gap-1">
          {ALL_ACTIONS.map((action) => {
            const active =
              actionFilter.length === 0 || actionFilter.includes(action);
            return (
              <button
                key={action}
                type="button"
                onClick={() => toggleAction(action)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  active
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-transparent border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {ACTION_LABELS[action]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main drawer
// ---------------------------------------------------------------------------

export function ActivityDrawer() {
  const { isOpen, scope: storeScope, close, userFilter, actionFilter, setUserFilter, setActionFilter } =
    useActivityDrawerStore();

  const hasScope = !!storeScope?.connectionId && !!storeScope?.bucket;

  // Build scope for the query (enabled only when we have connectionId + bucket)
  const scope = {
    connectionId: storeScope?.connectionId ?? "",
    bucket: storeScope?.bucket ?? "",
    prefix: storeScope?.prefix,
    key: storeScope?.objectKey,
    userId: userFilter ?? undefined,
    actions: actionFilter.length > 0 ? actionFilter : undefined,
  };

  const { events, hasMore, fetchNextPage, refetch, isLoading, isError } =
    useActivity(scope);

  // Derived: scope label for header subtitle
  const scopeLabel = storeScope?.bucket
    ? storeScope?.prefix
      ? `${storeScope.bucket} / ${storeScope.prefix}`
      : storeScope.bucket
    : undefined;

  // Client-side filter (user + action)
  const filteredEvents = events.filter((e) => {
    if (userFilter && e.userId !== userFilter) return false;
    if (actionFilter.length > 0 && !actionFilter.includes(e.action)) return false;
    return true;
  });

  const rows = groupActivityEvents(filteredEvents);
  const hasActiveFilters = !!userFilter || actionFilter.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  return (
    <>
      {/* Invisible backdrop — closes drawer on outside click */}
      {isOpen && (
        <div
          aria-hidden
          style={{ position: "fixed", inset: 0, zIndex: 39 }}
          onClick={close}
        />
      )}
    <div
      aria-label="Activity drawer"
      aria-hidden={!isOpen}
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
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Activity</h2>
          </div>
          {scopeLabel && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[260px]">
              {scopeLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => refetch()}
            disabled={!hasScope}
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={close}
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* No scope placeholder */}
      {!hasScope ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <Activity className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Open a bucket to see activity
          </p>
        </div>
      ) : (
        <>
          {/* Filter strip */}
          <FilterStrip
            events={events}
            userFilter={userFilter}
            actionFilter={actionFilter}
            setUserFilter={setUserFilter}
            setActionFilter={setActionFilter}
          />

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center gap-3 h-32 px-4">
                <p className="text-sm text-muted-foreground">
                  Couldn&apos;t load activity
                </p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 h-32 px-4 text-center">
                <p className="text-sm text-muted-foreground">
                  {hasActiveFilters
                    ? "No activity matches the current filters"
                    : "No activity yet"}
                </p>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setUserFilter(null);
                      setActionFilter([]);
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <div>
                {rows.map((row) => (
                  <ActivityRowItem
                    key={
                      row.type === "single"
                        ? row.event.id
                        : row.batchId
                    }
                    row={row}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {hasMore && !isLoading && (
            <div className="shrink-0 px-4 py-3 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => fetchNextPage()}
              >
                Load older
              </Button>
            </div>
          )}
        </>
      )}
    </div>
    </>
  );
}
