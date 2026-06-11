"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInfoDrawerStore } from "@/lib/stores/info-drawer-store";
import { useActivity } from "@/lib/queries/activity";
import { groupActivityEvents } from "@/components/activity/batch-grouping";
import type { ActivityRow, BatchRow } from "@/components/activity/batch-grouping";
import type { ActivityEventResponse } from "@/lib/queries/activity";
import type { ActivityAction } from "@/generated/prisma/client";
import { ACTION_VERBS, lastSegment, eventTarget } from "@/components/activity/event-format";
import { Avatar } from "./avatar";
import { formatRelativeTime } from "./format-time";

const ALL_ACTIONS: ActivityAction[] = [
  "UPLOAD",
  "DELETE",
  "COPY",
  "MOVE",
  "RENAME",
  "FOLDER_CREATE",
  "TAG_CHANGE",
  "METADATA_CHANGE",
  "BUCKET_CREATE",
  "BUCKET_DELETE",
  "SHARE_CREATED",
  "SHARE_REVOKED",
  "MULTIPART_ABORT",
  "VERSION_RESTORE",
  "VERSION_UNDELETE",
  "VERSION_PURGE",
  "BUCKET_VERSIONING_ENABLE",
  "BUCKET_VERSIONING_SUSPEND",
];

const ACTION_LABELS: Record<ActivityAction, string> = {
  UPLOAD: "Upload",
  DELETE: "Delete",
  COPY: "Copy",
  MOVE: "Move",
  RENAME: "Rename",
  FOLDER_CREATE: "Folder create",
  TAG_CHANGE: "Tag change",
  METADATA_CHANGE: "Metadata change",
  BUCKET_CREATE: "Bucket create",
  BUCKET_DELETE: "Bucket delete",
  SHARE_CREATED: "Share created",
  SHARE_REVOKED: "Share revoked",
  MULTIPART_ABORT: "Multipart abort",
  VERSION_RESTORE: "Version restore",
  VERSION_UNDELETE: "Version undelete",
  VERSION_PURGE: "Version purge",
  BUCKET_VERSIONING_ENABLE: "Versioning enable",
  BUCKET_VERSIONING_SUSPEND: "Versioning suspend",
};

function parentPath(path: string): string {
  const trimmed = path.replace(/\/$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? "" : trimmed.slice(0, idx + 1);
}

function eventParentPath(event: ActivityEventResponse): string | null {
  if (!event.key) return null;
  return parentPath(event.key) || null;
}

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

function BatchRowItem({ row }: { row: BatchRow }) {
  const [expanded, setExpanded] = useState(row.isExpanded);
  const verb = ACTION_VERBS[row.action];
  const ts = formatRelativeTime(row.createdAt);
  const firstKey = row.children[0]?.key;
  const batchParent = firstKey ? parentPath(firstKey) || row.bucket : row.bucket;

  return (
    <div>
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
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>
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

function ActivityRowItem({ row }: { row: ActivityRow }) {
  if (row.type === "single") return <SingleRowItem event={row.event} />;
  return <BatchRowItem row={row} />;
}

function FilterStrip({
  events,
  userFilter,
  actionFilter,
  setUserFilter,
  setActionFilter,
}: {
  events: ActivityEventResponse[];
  userFilter: string | null;
  actionFilter: ActivityAction[] | null;
  setUserFilter: (v: string | null) => void;
  setActionFilter: (v: ActivityAction[] | null) => void;
}) {
  const userMap = new Map<string, string>();
  for (const e of events) {
    if (e.userId) userMap.set(e.userId, e.userDisplayName);
  }
  const users = Array.from(userMap.entries());

  function toggleAction(action: ActivityAction) {
    if (actionFilter === null) {
      setActionFilter(ALL_ACTIONS.filter((a) => a !== action));
    } else if (actionFilter.includes(action)) {
      const next = actionFilter.filter((a) => a !== action);
      setActionFilter(next);
    } else {
      const next = [...actionFilter, action];
      setActionFilter(next.length === ALL_ACTIONS.length ? null : next);
    }
  }

  return (
    <div className="border-b border-border px-4 py-2 space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground shrink-0">User</label>
        <select
          value={userFilter ?? ""}
          onChange={(e) => setUserFilter(e.target.value || null)}
          className="flex-1 text-xs h-7"
        >
          <option value="">All users</option>
          {users.map(([uid, name]) => (
            <option key={uid} value={uid}>{name}</option>
          ))}
        </select>
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-1.5">Actions</div>
        <div className="flex flex-wrap gap-1">
          {ALL_ACTIONS.map((action) => {
            const active = actionFilter === null || actionFilter.includes(action);
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

export function ActivityTab() {
  const { scope: storeScope, userFilter, actionFilter, setUserFilter, setActionFilter } =
    useInfoDrawerStore();

  const hasScope = !!storeScope?.connectionId && !!storeScope?.bucket;

  const scope = {
    connectionId: storeScope?.connectionId ?? "",
    bucket: storeScope?.bucket ?? "",
    prefix: storeScope?.prefix,
    key: storeScope?.objectKey,
    userId: userFilter ?? undefined,
    actions: actionFilter !== null && actionFilter.length > 0 ? actionFilter : undefined,
  };

  const { events, hasMore, fetchNextPage, refetch, isLoading, isError } =
    useActivity(scope);

  const filteredEvents = events.filter((e) => {
    if (userFilter && e.userId !== userFilter) return false;
    if (actionFilter !== null && !actionFilter.includes(e.action)) return false;
    return true;
  });

  const rows = groupActivityEvents(filteredEvents);
  const hasActiveFilters = !!userFilter || actionFilter !== null;

  if (!hasScope) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-muted-foreground">Open a bucket to see activity</p>
      </div>
    );
  }

  return (
    <>
      <FilterStrip
        events={events}
        userFilter={userFilter}
        actionFilter={actionFilter}
        setUserFilter={setUserFilter}
        setActionFilter={setActionFilter}
      />
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 h-32 px-4">
            <p className="text-sm text-muted-foreground">Couldn&apos;t load activity</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
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
                key={row.type === "single" ? row.event.id : row.batchId}
                row={row}
              />
            ))}
          </div>
        )}
      </div>
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
  );
}
