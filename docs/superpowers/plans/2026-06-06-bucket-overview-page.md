# Bucket Overview Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Coming soon" placeholder on the bucket detail Overview tab with a working dashboard — five cards (identity, versioning, on-demand storage stats, recent activity, incomplete uploads) — and move the versioning toggle off the file-browser toolbar.

**Architecture:** Five small cards composed by an `OverviewTab` orchestrator inside the existing `BucketDetailTabs`. A new pure-function module (`stats-helpers`) backs a new POST endpoint that paginates `ListObjectsV2`; the client gates it behind a "Compute stats" button via a `useQuery` with `enabled: false`. Activity-formatting helpers are extracted into a shared module so the Overview activity card and the existing info-drawer activity tab use the same source.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest (node env, `*.test.ts`), Tailwind 4, AWS SDK v3 (`@aws-sdk/client-s3`), TanStack React Query 5, Zustand 5.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `src/lib/buckets/stats-helpers.ts` | Pure accumulator/summarizer for object-stats pagination |
| `src/lib/buckets/stats-helpers.test.ts` | Vitest unit tests for the helpers |
| `src/app/api/buckets/[bucket]/stats/route.ts` | `POST` route: paginates `ListObjectsV2`, aggregates via helpers |
| `src/components/activity/event-format.ts` | Shared `ACTION_VERBS` + `lastSegment` + `eventTarget` |
| `src/components/buckets/overview-identity-card.tsx` | Identity card |
| `src/components/buckets/overview-versioning-card.tsx` | Versioning rich card with Enable/Suspend buttons |
| `src/components/buckets/overview-storage-stats-card.tsx` | On-demand stats card |
| `src/components/buckets/overview-activity-card.tsx` | Last-5 activity card |
| `src/components/buckets/overview-incomplete-uploads-card.tsx` | Multipart-count shortcut card |
| `src/components/buckets/overview-tab.tsx` | Orchestrator: grid + data fetching + child cards |

**Modified files:**

| Path | Change |
|---|---|
| `src/lib/queries/keys.ts` | Add `bucketStats` entry |
| `src/lib/queries/buckets.ts` | Add `BucketStats` type, `fetchBucketStats`, `useBucketStats` |
| `src/components/info-drawer/activity-tab.tsx` | Import `ACTION_VERBS`, `lastSegment`, `eventTarget` from shared module; delete local copies |
| `src/components/buckets/bucket-detail-tabs.tsx` | Default tab `"multipart"` → `"overview"`; replace `ComingSoonTab` for `overview` case with `<OverviewTab />` |
| `src/components/buckets/bucket-card.tsx` | "Settings" `router.push` target: `?tab=multipart` → `?tab=overview` |
| `src/components/browser/file-browser.tsx` | Remove `BucketVersioningToggle` import and JSX (keep `useBucketVersioning` and suspended banner) |

**Deleted files:**

| Path | Reason |
|---|---|
| `src/components/buckets/bucket-versioning-toggle.tsx` | Sole consumer (file-browser) removed; replaced by `OverviewVersioningCard` |

---

### Task 1: Pure stats helpers (TDD)

Build the pure accumulator/summarizer that the API route will use. Vitest is configured for `*.test.ts` in node env (see `vitest.config.ts`); helpers MUST be a `.ts` file (no JSX).

**Files:**
- Create: `src/lib/buckets/stats-helpers.ts`
- Create: `src/lib/buckets/stats-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/buckets/stats-helpers.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import {
  emptyAccumulator,
  accumulateObjectStats,
  summarizeStorageClasses,
} from "./stats-helpers";

describe("emptyAccumulator", () => {
  test("returns zero count, zero size, empty map", () => {
    const acc = emptyAccumulator();
    expect(acc.count).toBe(0);
    expect(acc.size).toBe(0);
    expect(acc.byClass.size).toBe(0);
  });
});

describe("accumulateObjectStats", () => {
  test("leaves the accumulator unchanged when given no entries", () => {
    const acc = emptyAccumulator();
    const result = accumulateObjectStats(acc, []);
    expect(result.count).toBe(0);
    expect(result.size).toBe(0);
    expect(result.byClass.size).toBe(0);
  });

  test("sums multiple objects of the same storage class", () => {
    const acc = emptyAccumulator();
    const result = accumulateObjectStats(acc, [
      { Size: 100, StorageClass: "STANDARD" },
      { Size: 250, StorageClass: "STANDARD" },
    ]);
    expect(result.count).toBe(2);
    expect(result.size).toBe(350);
    expect(result.byClass.get("STANDARD")).toEqual({ count: 2, size: 350 });
  });

  test("separates entries by storage class", () => {
    const acc = emptyAccumulator();
    const result = accumulateObjectStats(acc, [
      { Size: 100, StorageClass: "STANDARD" },
      { Size: 200, StorageClass: "STANDARD_IA" },
      { Size: 50, StorageClass: "STANDARD" },
    ]);
    expect(result.count).toBe(3);
    expect(result.size).toBe(350);
    expect(result.byClass.get("STANDARD")).toEqual({ count: 2, size: 150 });
    expect(result.byClass.get("STANDARD_IA")).toEqual({ count: 1, size: 200 });
  });

  test("treats Size: undefined as 0", () => {
    const acc = emptyAccumulator();
    const result = accumulateObjectStats(acc, [
      { Size: undefined, StorageClass: "STANDARD" },
    ]);
    expect(result.count).toBe(1);
    expect(result.size).toBe(0);
    expect(result.byClass.get("STANDARD")).toEqual({ count: 1, size: 0 });
  });

  test("treats StorageClass: undefined as STANDARD", () => {
    const acc = emptyAccumulator();
    const result = accumulateObjectStats(acc, [
      { Size: 100, StorageClass: undefined },
    ]);
    expect(result.byClass.get("STANDARD")).toEqual({ count: 1, size: 100 });
  });

  test("accumulator carries state across multiple calls", () => {
    let acc = emptyAccumulator();
    acc = accumulateObjectStats(acc, [{ Size: 100, StorageClass: "STANDARD" }]);
    acc = accumulateObjectStats(acc, [{ Size: 50, StorageClass: "STANDARD" }]);
    expect(acc.count).toBe(2);
    expect(acc.size).toBe(150);
    expect(acc.byClass.get("STANDARD")).toEqual({ count: 2, size: 150 });
  });
});

describe("summarizeStorageClasses", () => {
  test("returns an empty array when the map is empty", () => {
    expect(summarizeStorageClasses(new Map())).toEqual([]);
  });

  test("returns entries sorted by size descending", () => {
    const map = new Map([
      ["STANDARD_IA", { count: 1, size: 100 }],
      ["STANDARD", { count: 2, size: 500 }],
      ["GLACIER", { count: 3, size: 250 }],
    ]);
    expect(summarizeStorageClasses(map)).toEqual([
      { class: "STANDARD", count: 2, size: 500 },
      { class: "GLACIER", count: 3, size: 250 },
      { class: "STANDARD_IA", count: 1, size: 100 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm test -- src/lib/buckets/stats-helpers.test.ts`
Expected: All tests FAIL with "Cannot find module './stats-helpers'" or equivalent.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/buckets/stats-helpers.ts`:

```ts
export interface ObjectStatsAccumulator {
  count: number;
  size: number;
  byClass: Map<string, { count: number; size: number }>;
}

export interface StorageClassSummary {
  class: string;
  count: number;
  size: number;
}

export function emptyAccumulator(): ObjectStatsAccumulator {
  return { count: 0, size: 0, byClass: new Map() };
}

export function accumulateObjectStats(
  acc: ObjectStatsAccumulator,
  contents: Array<{ Size?: number; StorageClass?: string }>,
): ObjectStatsAccumulator {
  for (const entry of contents) {
    const size = entry.Size ?? 0;
    const cls = entry.StorageClass ?? "STANDARD";
    acc.count += 1;
    acc.size += size;
    const prior = acc.byClass.get(cls);
    if (prior) {
      prior.count += 1;
      prior.size += size;
    } else {
      acc.byClass.set(cls, { count: 1, size });
    }
  }
  return acc;
}

export function summarizeStorageClasses(
  byClass: Map<string, { count: number; size: number }>,
): StorageClassSummary[] {
  return Array.from(byClass.entries())
    .map(([cls, v]) => ({ class: cls, count: v.count, size: v.size }))
    .sort((a, b) => b.size - a.size);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test -- src/lib/buckets/stats-helpers.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/buckets/stats-helpers.ts src/lib/buckets/stats-helpers.test.ts
git commit -m "feat(buckets): add pure stats helpers for object aggregation"
```

---

### Task 2: Add bucketStats query key

**Files:**
- Modify: `src/lib/queries/keys.ts`

- [ ] **Step 1: Add the entry**

In `src/lib/queries/keys.ts`, append a `bucketStats` block inside the `queryKeys` object after `bucketVersioning`:

```ts
  bucketStats: {
    all: ["bucket-stats"] as const,
    byBucket: (connectionId: string, bucket: string) =>
      [...queryKeys.bucketStats.all, connectionId, bucket] as const,
  },
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm lint`
Expected: No new errors. (Pre-existing warnings unrelated to this change are OK.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/keys.ts
git commit -m "feat(queries): add bucketStats query key"
```

---

### Task 3: Add stats API route

Paginate `ListObjectsV2` over the whole bucket using the helpers from Task 1. Mirror the auth + error pattern used by `src/app/api/buckets/[bucket]/multipart-uploads/route.ts`.

**Files:**
- Create: `src/app/api/buckets/[bucket]/stats/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import {
  emptyAccumulator,
  accumulateObjectStats,
  summarizeStorageClasses,
} from "@/lib/buckets/stats-helpers";

type RouteContext = { params: Promise<{ bucket: string }> };

export const POST = withAuth<RouteContext>(async (req, { user, params }) => {
  try {
    const { bucket } = await params;
    const { connectionId }: { connectionId: string } = await req.json();

    if (!connectionId || !bucket) {
      return NextResponse.json(
        { error: "connectionId and bucket are required" },
        { status: 400 },
      );
    }

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const client = createS3Client(access.connection);

    let acc = emptyAccumulator();
    let continuationToken: string | undefined = undefined;

    for (;;) {
      const response: ListObjectsV2CommandOutput = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        }),
      );
      acc = accumulateObjectStats(acc, response.Contents ?? []);
      if (!response.IsTruncated) break;
      continuationToken = response.NextContinuationToken ?? undefined;
    }

    return NextResponse.json({
      objectCount: acc.count,
      totalSize: acc.size,
      storageClasses: summarizeStorageClasses(acc.byClass),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
```

- [ ] **Step 2: Lint check**

Run: `pnpm lint`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/buckets/[bucket]/stats/route.ts
git commit -m "feat(api): add bucket stats route"
```

---

### Task 4: Add useBucketStats hook

Add the client query hook to `src/lib/queries/buckets.ts`. The query MUST be `enabled: false` so it does not auto-run on mount; the card triggers it via `refetch()`. Use `staleTime: Infinity` and `gcTime: 5 minutes` to retain the snapshot in cache while the user navigates around.

**Files:**
- Modify: `src/lib/queries/buckets.ts`

- [ ] **Step 1: Append the hook**

Add at the bottom of `src/lib/queries/buckets.ts`:

```ts
export interface BucketStats {
  objectCount: number;
  totalSize: number;
  storageClasses: Array<{ class: string; count: number; size: number }>;
}

async function fetchBucketStats(
  connectionId: string,
  bucket: string,
): Promise<BucketStats> {
  const res = await fetch(
    `/api/buckets/${encodeURIComponent(bucket)}/stats`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch bucket stats");
  }
  return res.json();
}

export function useBucketStats(connectionId: string, bucket: string) {
  return useQuery({
    queryKey: queryKeys.bucketStats.byBucket(connectionId, bucket),
    queryFn: () => fetchBucketStats(connectionId, bucket),
    enabled: false,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Lint check**

Run: `pnpm lint`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/buckets.ts
git commit -m "feat(queries): add useBucketStats hook"
```

---

### Task 5: Extract shared event-format module

Pull `ACTION_VERBS`, `lastSegment`, and `eventTarget` out of `activity-tab.tsx` into a shared module so the Overview activity card can use the exact same source.

**Files:**
- Create: `src/components/activity/event-format.ts`
- Modify: `src/components/info-drawer/activity-tab.tsx`

- [ ] **Step 1: Create the shared module**

Create `src/components/activity/event-format.ts`:

```ts
import type { ActivityAction } from "@/generated/prisma/client";
import type { ActivityEventResponse } from "@/lib/queries/activity";

export const ACTION_VERBS: Record<ActivityAction, string> = {
  UPLOAD: "uploaded",
  DELETE: "deleted",
  COPY: "copied",
  MOVE: "moved",
  RENAME: "renamed",
  FOLDER_CREATE: "created folder",
  TAG_CHANGE: "updated tags on",
  BUCKET_CREATE: "created bucket",
  BUCKET_DELETE: "deleted bucket",
  SHARE_CREATED: "shared",
  SHARE_REVOKED: "revoked share for",
  MULTIPART_ABORT: "aborted",
  VERSION_RESTORE: "restored a version of",
  VERSION_UNDELETE: "undeleted",
  VERSION_PURGE: "permanently deleted a version of",
  BUCKET_VERSIONING_ENABLE: "enabled versioning on",
  BUCKET_VERSIONING_SUSPEND: "suspended versioning on",
};

export function lastSegment(path: string): string {
  const trimmed = path.replace(/\/$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

export function eventTarget(event: ActivityEventResponse): string {
  const { action, key, targetKey, bucket } = event;
  if (!key) return bucket;
  if ((action === "RENAME" || action === "MOVE") && targetKey) {
    return `${lastSegment(key)} → ${lastSegment(targetKey)}`;
  }
  return lastSegment(key);
}
```

- [ ] **Step 2: Refactor activity-tab.tsx to import from the shared module**

In `src/components/info-drawer/activity-tab.tsx`:

1. Add the import near the other imports:
```tsx
import { ACTION_VERBS, lastSegment, eventTarget } from "@/components/activity/event-format";
```

2. Delete the local `const ACTION_VERBS: Record<ActivityAction, string> = { ... }` block (lines 15-33).
3. Delete the local `function lastSegment(path: string): string { ... }` block (lines 75-79).
4. Delete the local `function eventTarget(event: ActivityEventResponse): string { ... }` block (lines 87-94).

(The `parentPath`, `eventParentPath`, `ACTION_LABELS`, and `ALL_ACTIONS` constants and helpers stay local — only the three pieces used by the Overview card move.)

- [ ] **Step 3: Lint check**

Run: `pnpm lint`
Expected: No new errors.

- [ ] **Step 4: Verify activity drawer still works**

Start dev server: `pnpm dev`
In browser: open any bucket → click the History (Activity) icon in the file-browser toolbar → confirm activity entries still render with verbs and target names.

- [ ] **Step 5: Commit**

```bash
git add src/components/activity/event-format.ts src/components/info-drawer/activity-tab.tsx
git commit -m "refactor(activity): extract ACTION_VERBS and event helpers to shared module"
```

---

### Task 6: OverviewIdentityCard

Pure presentational. Receives `connection` (`ConnectionResponse | undefined`) and `bucketMeta` (`S3Bucket | undefined`) as props.

**Files:**
- Create: `src/components/buckets/overview-identity-card.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { ConnectionResponse } from "@/lib/queries/connections";
import type { S3Bucket } from "@/types";

interface OverviewIdentityCardProps {
  bucket: string;
  connection: ConnectionResponse | undefined;
  bucketMeta: S3Bucket | undefined;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground w-32 shrink-0">
        {label}
      </dt>
      <dd className="text-sm min-w-0 flex-1 truncate">{value}</dd>
    </div>
  );
}

export function OverviewIdentityCard({
  bucket,
  connection,
  bucketMeta,
}: OverviewIdentityCardProps) {
  const connectionLabel =
    connection?.name || connection?.endpoint || "Unknown connection";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-muted-foreground" />
          <span className="font-mono truncate">{bucket}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl>
          <Row
            label="Connection"
            value={
              connection ? (
                <Link
                  href={`/connections#connection-${connection.id}`}
                  className="hover:underline"
                >
                  {connectionLabel}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            }
          />
          <Row
            label="Region"
            value={
              connection?.region ? (
                connection.region
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )
            }
          />
          <Row
            label="Endpoint"
            value={
              connection?.endpoint ? (
                <span className="font-mono text-xs">{connection.endpoint}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            }
          />
          <Row
            label="Created"
            value={
              bucketMeta?.creationDate ? (
                formatDate(bucketMeta.creationDate)
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )
            }
          />
        </dl>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Lint check**

Run: `pnpm lint`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/buckets/overview-identity-card.tsx
git commit -m "feat(buckets): add overview identity card"
```

---

### Task 7: OverviewVersioningCard

Rich card replacing the old toolbar dropdown. Wires the existing `useBucketVersioning` and `useSetBucketVersioning` hooks.

**Files:**
- Create: `src/components/buckets/overview-versioning-card.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBucketVersioning, useSetBucketVersioning } from "@/lib/queries/buckets";
import { toast } from "@/hooks/use-toast";

interface OverviewVersioningCardProps {
  connectionId: string;
  bucket: string;
  canEdit: boolean;
}

const STATUS_PILL: Record<string, string> = {
  Enabled: "bg-green-500/15 text-green-600 border-green-500/30",
  Suspended: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  Disabled: "bg-muted text-muted-foreground border-border",
};

const STATUS_EXPLAINER: Record<string, string> = {
  Enabled:
    "New uploads create a new version. Deletes leave a delete marker. Older versions stay until purged.",
  Suspended:
    "New uploads overwrite the current version. Existing versions are preserved.",
  Disabled:
    "Versioning has never been turned on. Once enabled it can be suspended but not turned off.",
};

export function OverviewVersioningCard({
  connectionId,
  bucket,
  canEdit,
}: OverviewVersioningCardProps) {
  const versioning = useBucketVersioning(connectionId, bucket);
  const setVersioning = useSetBucketVersioning(connectionId, bucket);

  const status = versioning.data?.status ?? "Disabled";
  const isPending = setVersioning.isPending;

  const handleEnable = () =>
    setVersioning.mutate(true, {
      onSuccess: () => toast({ title: "Versioning enabled." }),
      onError: (e) =>
        toast({
          title: "Failed to enable",
          description: (e as Error).message,
        }),
    });

  const handleSuspend = () =>
    setVersioning.mutate(false, {
      onSuccess: () => toast({ title: "Versioning suspended." }),
      onError: (e) =>
        toast({
          title: "Failed to suspend",
          description: (e as Error).message,
        }),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          Versioning
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {versioning.isError ? (
          <div className="text-sm text-muted-foreground">
            Failed to load versioning status.{" "}
            <button
              type="button"
              onClick={() => versioning.refetch()}
              className="text-foreground underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                  STATUS_PILL[status],
                )}
              >
                {status}
              </span>
              {versioning.isLoading && (
                <span className="text-xs text-muted-foreground">Loading…</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {STATUS_EXPLAINER[status]}
            </p>
            {canEdit ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="default"
                  disabled={status === "Enabled" || isPending}
                  onClick={handleEnable}
                >
                  Enable
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={status !== "Enabled" || isPending}
                  onClick={handleSuspend}
                >
                  Suspend
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Viewer — read only
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Lint check**

Run: `pnpm lint`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/buckets/overview-versioning-card.tsx
git commit -m "feat(buckets): add overview versioning card"
```

---

### Task 8: OverviewStorageStatsCard

On-demand stats: button triggers `refetch()`. Uses `formatBytes` from `@/lib/utils` for size formatting.

**Files:**
- Create: `src/components/buckets/overview-storage-stats-card.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { useBucketStats } from "@/lib/queries/buckets";

interface OverviewStorageStatsCardProps {
  connectionId: string;
  bucket: string;
}

export function OverviewStorageStatsCard({
  connectionId,
  bucket,
}: OverviewStorageStatsCardProps) {
  const stats = useBucketStats(connectionId, bucket);
  const hasData = !!stats.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          Storage stats
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats.isError && (
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              {(stats.error as Error)?.message ?? "Failed to compute stats."}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => stats.refetch()}
            >
              Retry
            </Button>
          </div>
        )}

        {!stats.isError && !hasData && !stats.isFetching && (
          <>
            <p className="text-sm text-muted-foreground">
              Counts all objects in the bucket and totals their size. May take a
              while on large buckets — does not run automatically.
            </p>
            <Button
              size="sm"
              variant="default"
              onClick={() => stats.refetch()}
            >
              Compute stats
            </Button>
          </>
        )}

        {stats.isFetching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Counting objects…
          </div>
        )}

        {hasData && !stats.isFetching && stats.data && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Objects
                </div>
                <div className="text-2xl font-semibold">
                  {stats.data.objectCount.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Total size
                </div>
                <div className="text-2xl font-semibold">
                  {formatBytes(stats.data.totalSize)}
                </div>
              </div>
            </div>

            {stats.data.storageClasses.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-2">Storage class</th>
                      <th className="p-2 text-right">Count</th>
                      <th className="p-2 text-right">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.data.storageClasses.map((row) => (
                      <tr key={row.class} className="border-t">
                        <td className="p-2 font-mono text-xs">{row.class}</td>
                        <td className="p-2 text-right">
                          {row.count.toLocaleString()}
                        </td>
                        <td className="p-2 text-right">
                          {formatBytes(row.size)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => stats.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Lint check**

Run: `pnpm lint`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/buckets/overview-storage-stats-card.tsx
git commit -m "feat(buckets): add overview storage stats card"
```

---

### Task 9: OverviewActivityCard

Last 5 events scoped to the bucket. Reuses `Avatar`, `formatRelativeTime`, and the newly shared `event-format` helpers.

**Files:**
- Create: `src/components/buckets/overview-activity-card.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ArrowRight } from "lucide-react";
import { useActivity } from "@/lib/queries/activity";
import { useInfoDrawerStore } from "@/lib/stores/info-drawer-store";
import { Avatar } from "@/components/info-drawer/avatar";
import { formatRelativeTime } from "@/components/info-drawer/format-time";
import { ACTION_VERBS, eventTarget } from "@/components/activity/event-format";

interface OverviewActivityCardProps {
  connectionId: string;
  bucket: string;
}

export function OverviewActivityCard({
  connectionId,
  bucket,
}: OverviewActivityCardProps) {
  const { events, isLoading, isError } = useActivity({ connectionId, bucket });
  const setScope = useInfoDrawerStore((s) => s.setScope);
  const open = useInfoDrawerStore((s) => s.open);

  const recent = events.slice(0, 5);

  const openDrawer = () => {
    setScope({ connectionId, bucket });
    open("activity");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          Recent activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {isError && (
          <p className="text-sm text-muted-foreground">
            Failed to load activity.
          </p>
        )}
        {!isLoading && !isError && recent.length === 0 && (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        )}
        {!isLoading && !isError && recent.length > 0 && (
          <ul className="space-y-2">
            {recent.map((event) => (
              <li
                key={event.id}
                className="flex items-start gap-2 text-sm"
              >
                <Avatar
                  userId={event.userId}
                  displayName={event.userDisplayName}
                  imageUrl={event.userImageUrl}
                  size={20}
                />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{event.userDisplayName}</span>{" "}
                  <span className="text-muted-foreground">
                    {ACTION_VERBS[event.action]}
                  </span>{" "}
                  <span className="font-mono text-xs truncate">
                    {eventTarget(event)}
                  </span>
                  <div className="text-xs text-muted-foreground">
                    {formatRelativeTime(event.createdAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={openDrawer}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          View all activity
          <ArrowRight className="h-3 w-3" />
        </button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Lint check**

Run: `pnpm lint`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/buckets/overview-activity-card.tsx
git commit -m "feat(buckets): add overview activity card"
```

---

### Task 10: OverviewIncompleteUploadsCard

Count of incomplete uploads + link to the multipart tab. Uses existing `useIncompleteUploads`.

**Files:**
- Create: `src/components/buckets/overview-incomplete-uploads-card.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { useIncompleteUploads } from "@/lib/queries/multipart-uploads";

interface OverviewIncompleteUploadsCardProps {
  connectionId: string;
  bucket: string;
}

export function OverviewIncompleteUploadsCard({
  connectionId,
  bucket,
}: OverviewIncompleteUploadsCardProps) {
  const { data: uploads, isLoading, isError } = useIncompleteUploads(
    connectionId,
    bucket,
  );
  const count = uploads?.length ?? 0;

  const multipartHref = `/buckets/${connectionId}/${encodeURIComponent(
    bucket,
  )}?tab=multipart`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-muted-foreground" />
          Incomplete uploads
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking for incomplete uploads…
          </div>
        )}
        {isError && (
          <p className="text-sm text-muted-foreground">
            Failed to load incomplete uploads.
          </p>
        )}
        {!isLoading && !isError && count === 0 && (
          <p className="text-sm text-muted-foreground">
            No incomplete uploads.
          </p>
        )}
        {!isLoading && !isError && count > 0 && (
          <>
            <p className="text-sm">
              <span className="font-semibold">{count}</span> incomplete upload
              {count !== 1 ? "s" : ""}.
            </p>
            <Link
              href={multipartHref}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Review uploads
              <ArrowRight className="h-3 w-3" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Lint check**

Run: `pnpm lint`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/buckets/overview-incomplete-uploads-card.tsx
git commit -m "feat(buckets): add overview incomplete uploads card"
```

---

### Task 11: OverviewTab orchestrator + wire into BucketDetailTabs

Compose the five cards in the responsive grid; wire into the existing tab router; change the default tab from `multipart` to `overview`.

**Files:**
- Create: `src/components/buckets/overview-tab.tsx`
- Modify: `src/components/buckets/bucket-detail-tabs.tsx`

- [ ] **Step 1: Write the orchestrator**

Create `src/components/buckets/overview-tab.tsx`:

```tsx
"use client";

import { useConnections } from "@/lib/queries/connections";
import { useBuckets } from "@/lib/queries/buckets";
import { OverviewIdentityCard } from "./overview-identity-card";
import { OverviewVersioningCard } from "./overview-versioning-card";
import { OverviewStorageStatsCard } from "./overview-storage-stats-card";
import { OverviewActivityCard } from "./overview-activity-card";
import { OverviewIncompleteUploadsCard } from "./overview-incomplete-uploads-card";

interface OverviewTabProps {
  connectionId: string;
  bucket: string;
}

export function OverviewTab({ connectionId, bucket }: OverviewTabProps) {
  const { data: connections = [] } = useConnections();
  const connection = connections.find((c) => c.id === connectionId);
  const canEdit = connection?.role === "ADMIN";

  const { data: bucketsList = [] } = useBuckets(connectionId);
  const bucketMeta = bucketsList.find((b) => b.name === bucket);

  return (
    <div className="space-y-4">
      <OverviewIdentityCard
        bucket={bucket}
        connection={connection}
        bucketMeta={bucketMeta}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OverviewVersioningCard
          connectionId={connectionId}
          bucket={bucket}
          canEdit={!!canEdit}
        />
        <OverviewStorageStatsCard
          connectionId={connectionId}
          bucket={bucket}
        />
        <OverviewActivityCard connectionId={connectionId} bucket={bucket} />
        <OverviewIncompleteUploadsCard
          connectionId={connectionId}
          bucket={bucket}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into BucketDetailTabs**

In `src/components/buckets/bucket-detail-tabs.tsx`:

1. Add the import after the existing `MultipartUploadsTab` import:
```tsx
import { OverviewTab } from "./overview-tab";
```

2. Change line 33 from:
```tsx
  const activeTab: TabKey = isTabKey(rawTab) ? rawTab : "multipart";
```
to:
```tsx
  const activeTab: TabKey = isTabKey(rawTab) ? rawTab : "overview";
```

3. Replace the `overview` case (lines 85-90) — currently:
```tsx
        {activeTab === "overview" && (
          <ComingSoonTab
            title="Overview coming soon"
            description="A snapshot of this bucket: region, object count, total size, and storage-class breakdown."
          />
        )}
```
with:
```tsx
        {activeTab === "overview" && (
          <OverviewTab connectionId={connectionId} bucket={bucket} />
        )}
```

- [ ] **Step 3: Lint check**

Run: `pnpm lint`
Expected: No new errors.

- [ ] **Step 4: Smoke test**

Start dev server: `pnpm dev`
In browser:
1. Navigate to `/buckets/<connectionId>/<bucket-name>` — confirm Overview tab is selected by default.
2. Confirm Identity card shows name, connection link, region, endpoint, creation date.
3. Confirm Versioning card shows status pill + explainer + Enable/Suspend buttons (or "Viewer — read only" for viewer roles).
4. Confirm Storage stats card shows `[Compute stats]` button initially; click it; confirm counting state then result table renders.
5. Confirm Activity card shows up to 5 entries; click "View all activity" — info drawer opens to Activity tab scoped to this bucket.
6. Confirm Incomplete uploads card shows count or "No incomplete uploads"; if non-zero, click "Review uploads" — page tab switches to Incomplete uploads.

- [ ] **Step 5: Commit**

```bash
git add src/components/buckets/overview-tab.tsx src/components/buckets/bucket-detail-tabs.tsx
git commit -m "feat(buckets): wire overview tab into bucket detail page"
```

---

### Task 12: Update BucketCard Settings link

Make the bucket card's Settings menu item land on Overview instead of Multipart.

**Files:**
- Modify: `src/components/buckets/bucket-card.tsx`

- [ ] **Step 1: Edit the router push call**

In `src/components/buckets/bucket-card.tsx`, change line 122-123 — currently:

```tsx
                    router.push(
                      `/buckets/${connectionId}/${encodeURIComponent(bucket.name)}?tab=multipart`
                    );
```

to:

```tsx
                    router.push(
                      `/buckets/${connectionId}/${encodeURIComponent(bucket.name)}?tab=overview`
                    );
```

- [ ] **Step 2: Lint check**

Run: `pnpm lint`
Expected: No new errors.

- [ ] **Step 3: Smoke test**

In dev browser: open `/buckets`, click the kebab menu on any bucket card, click "Settings" — confirm it opens the Overview tab.

- [ ] **Step 4: Commit**

```bash
git add src/components/buckets/bucket-card.tsx
git commit -m "feat(buckets): point bucket card settings to overview tab"
```

---

### Task 13: Remove BucketVersioningToggle from FileBrowser and delete the component

The versioning toggle now lives on the Overview page. Remove its toolbar incarnation; keep the suspended-banner.

**Files:**
- Modify: `src/components/browser/file-browser.tsx`
- Delete: `src/components/buckets/bucket-versioning-toggle.tsx`

- [ ] **Step 1: Remove the import**

In `src/components/browser/file-browser.tsx`, delete this line (currently line 39):

```tsx
import { BucketVersioningToggle } from "@/components/buckets/bucket-versioning-toggle";
```

(Keep the `import { useBucketVersioning } from "@/lib/queries/buckets";` line below it — the suspended banner uses it.)

- [ ] **Step 2: Remove the JSX usage**

In the same file, delete this block (currently lines 457-461):

```tsx
          <BucketVersioningToggle
            connectionId={connectionId}
            bucket={bucket}
            canEdit={canWrite}
          />
```

(Leave the surrounding `{!canWrite && <span>Viewer</span>}` and the `<ViewModeToggle>` intact.)

- [ ] **Step 3: Delete the now-unused component**

Run: `git rm src/components/buckets/bucket-versioning-toggle.tsx`

- [ ] **Step 4: Lint check**

Run: `pnpm lint`
Expected: No new errors. (If lint complains about a dangling `BucketVersioningToggle` reference anywhere else, search for it: `grep -r "BucketVersioningToggle" src/`. Per the spec, file-browser is the sole consumer.)

- [ ] **Step 5: Smoke test**

In dev browser:
1. Open a bucket's file browser — confirm there's no versioning dropdown in the toolbar between Viewer/`<ViewModeToggle />`.
2. If the bucket has versioning Suspended, confirm the yellow "Versioning suspended" banner still appears above the file list.
3. From file browser, navigate to the bucket's Overview tab (via the bucket card's Settings menu or by URL) — confirm versioning controls work from there.

- [ ] **Step 6: Commit**

```bash
git add src/components/browser/file-browser.tsx
git commit -m "feat(browser): remove versioning toggle from toolbar (moved to overview)"
```

---

## Self-Review Notes

- All tasks have full file paths, complete code, exact commands.
- TDD applies to Task 1 (pure helpers). UI tasks use lint + smoke checks since the repo has no component-test convention.
- Type/method name consistency check: `ObjectStatsAccumulator`, `StorageClassSummary`, `BucketStats`, `useBucketStats`, `OverviewTab`, `OverviewIdentityCard`, `OverviewVersioningCard`, `OverviewStorageStatsCard`, `OverviewActivityCard`, `OverviewIncompleteUploadsCard` — all used consistently in every task.
- Each task's commit is independent — partial completion still leaves the codebase in a working state (except Task 13 which assumes Tasks 1–11 landed first, since deleting the toggle without an Overview replacement would leave users with no way to enable versioning).
- `formatBytes` from `@/lib/utils` is reused (not re-implemented).
- Tests live alongside source in `src/**/*.test.ts`, matching `vitest.config.ts` include rule.
