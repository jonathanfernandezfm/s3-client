# Connection Indexing Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Search index" card to the connection Overview tab that surfaces crawl state (Locked / Hidden / Empty / Running / Done / Done-capped / Failed) and lets users who have never been indexed manually trigger an initial crawl.

**Architecture:** One client component (`ConnectionIndexingCard`) reads connection-scoped index state via a new shared React Query hook (`useSearchIndexStatus`) and renders one of seven variants based on `(tier, state)`. A second hook (`useTriggerSearchIndex`) posts to a new `POST /api/connections/[id]/search-index/trigger` endpoint, which creates a `CrawlJob` row with `kind = INITIAL` and fires the existing `/api/internal/crawl` runner — mirroring the fire-and-forget pattern in `/api/internal/reconcile/route.ts:14-23`. The existing inline chip in `search-index-status.tsx` is refactored to consume the same shared hook so its cache is shared with the card.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, TanStack Query 5, Prisma, Tailwind, Lucide icons, Zustand.

---

## File Map

| Path | Op | Responsibility |
|---|---|---|
| `src/lib/queries/keys.ts` | Modify | Add `searchIndex: { all, status(id) }` key namespace |
| `src/lib/queries/search-index.ts` | Create | Shared `useSearchIndexStatus(connectionId)` query hook + `useTriggerSearchIndex()` mutation hook |
| `src/components/connections/search-index-status.tsx` | Modify | Replace inline `useQuery` with the shared hook (no behavior change) |
| `src/app/api/connections/[id]/search-index/trigger/route.ts` | Create | `POST` endpoint that creates INITIAL `CrawlJob` and fires `/api/internal/crawl` |
| `src/components/connections/connection-indexing-card.tsx` | Create | New card with seven variants (Locked / Hidden / Empty / Running / Done / Done-capped / Failed) |
| `src/components/connections/connection-overview-tab.tsx` | Modify | Drop `ConnectionIndexingCard` into the 2-column grid |

---

## Task 1: Add `searchIndex` key namespace

**Files:**
- Modify: `src/lib/queries/keys.ts`

- [ ] **Step 1: Add the namespace**

In `src/lib/queries/keys.ts`, find the closing `};` of the `queryKeys` object and add a new namespace right above it. The `search` namespace already exists for global file search — `searchIndex` is a separate concern (index/crawl state, not user query results).

Replace this block:

```ts
  search: {
    all: ["search"] as const,
    query: (q: string) => [...queryKeys.search.all, "query", q] as const,
  },
};
```

With:

```ts
  search: {
    all: ["search"] as const,
    query: (q: string) => [...queryKeys.search.all, "query", q] as const,
  },
  searchIndex: {
    all: ["search-index"] as const,
    status: (connectionId: string) =>
      [...queryKeys.searchIndex.all, "status", connectionId] as const,
  },
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm lint`
Expected: PASS (no errors in `src/lib/queries/keys.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/keys.ts
git commit -m "feat(search-index): add searchIndex query key namespace"
```

---

## Task 2: Create the shared `useSearchIndexStatus` hook

**Files:**
- Create: `src/lib/queries/search-index.ts`

The hook is a lift-and-shift of the inline `useQuery` in `src/components/connections/search-index-status.tsx:14-25`, plus a type export so the new card can match on `data.state`. The mutation hook will be added in Task 5 once the endpoint exists.

- [ ] **Step 1: Write the file**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./keys";

export type SearchIndexStatus =
  | { state: "indexing"; indexed: number }
  | { state: "ready"; indexed: number; lastReconciledAt: string | null }
  | { state: "partial"; indexed: number }
  | { state: "failed"; message: string }
  | { state: "disabled" }
  | { state: "none" };

export function useSearchIndexStatus(connectionId: string) {
  return useQuery<SearchIndexStatus>({
    queryKey: queryKeys.searchIndex.status(connectionId),
    queryFn: async () => {
      const res = await fetch(
        `/api/connections/${connectionId}/search-index-status`,
      );
      if (!res.ok) return { state: "disabled" } as SearchIndexStatus;
      return res.json();
    },
    refetchInterval: (q) =>
      q.state.data?.state === "indexing" ? 5_000 : false,
    staleTime: 10_000,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm lint`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/search-index.ts
git commit -m "feat(search-index): extract useSearchIndexStatus shared hook"
```

---

## Task 3: Refactor `search-index-status.tsx` chip to use the shared hook

**Files:**
- Modify: `src/components/connections/search-index-status.tsx`

This is a behavior-preserving refactor — the chip in the connection list keeps rendering the same way. The point is cache-sharing: once the new card mutates the same key, the chip flips state without a refetch.

- [ ] **Step 1: Replace the file body**

Overwrite the contents of `src/components/connections/search-index-status.tsx` with:

```tsx
"use client";

import { Search } from "lucide-react";
import { useSearchIndexStatus } from "@/lib/queries/search-index";

export function SearchIndexStatus({ connectionId }: { connectionId: string }) {
  const { data } = useSearchIndexStatus(connectionId);

  if (!data || data.state === "disabled" || data.state === "none") return null;

  const label =
    data.state === "indexing"
      ? `Indexing… ${data.indexed.toLocaleString()} objects`
      : data.state === "partial"
      ? `Partial index (${data.indexed.toLocaleString()}) — 2M cap reached`
      : data.state === "failed"
      ? `Index error: ${data.message}`
      : `Indexed ${data.indexed.toLocaleString()} objects`;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Search className="h-3 w-3" />
      <span>{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Smoke-test the chip**

Run `pnpm dev`, sign in as a PRO user with at least one indexed connection, navigate to `/connections`. Expected:
- The same chip ("Indexed N objects" / "Indexing… N objects" / etc.) renders on each connection card, matching what was there before.
- No console errors about missing keys or stale cache.

- [ ] **Step 3: Commit**

```bash
git add src/components/connections/search-index-status.tsx
git commit -m "refactor(search-index): share status cache via useSearchIndexStatus hook"
```

---

## Task 4: Create the trigger API endpoint

**Files:**
- Create: `src/app/api/connections/[id]/search-index/trigger/route.ts`

Mirrors the access-control + fire-and-forget pattern from the existing `POST /api/connections` initial-crawl block (`src/app/api/connections/route.ts:115-142`) and the reconcile fire helper (`src/app/api/internal/reconcile/route.ts:14-23`).

- [ ] **Step 1: Write the file**

```ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { getConnectionAccessById } from "@/lib/db/connections";
import { isSearchIndexEnabled } from "@/lib/search/feature-flag";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withAuth<RouteContext>(async (req, { user, params }) => {
  const { id } = params;

  if (!isSearchIndexEnabled()) {
    return NextResponse.json(
      { error: "Search indexing not available" },
      { status: 503 },
    );
  }

  const access = await getConnectionAccessById(id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tier = user.subscription?.tier ?? "FREE";
  if (tier !== "PRO" && tier !== "ENTERPRISE") {
    return NextResponse.json(
      { error: "PRO subscription required" },
      { status: 402 },
    );
  }

  const existing = await prisma.crawlJob.findFirst({
    where: { connectionId: id },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Index already started", jobId: existing.id },
      { status: 409 },
    );
  }

  const job = await prisma.crawlJob.create({
    data: {
      connectionId: id,
      kind: "INITIAL",
      status: "PENDING",
      bucketsRemaining: [],
    },
  });

  const token = process.env.INTERNAL_API_TOKEN;
  if (token) {
    fetch(`${req.nextUrl.origin}/api/internal/crawl?jobId=${job.id}`, {
      method: "POST",
      headers: { "x-internal-token": token },
    }).catch((err) => {
      console.error(
        `[search-index] manual trigger fire failed for ${id}:`,
        err,
      );
    });
  }

  return NextResponse.json(
    { ok: true, jobId: job.id, state: "indexing" },
    { status: 202 },
  );
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 3: Manual endpoint check**

With the dev server running, in a separate terminal:

```powershell
# Replace with your own connection id and Clerk session cookie if needed.
curl -X POST "http://localhost:3000/api/connections/<connectionId>/search-index/trigger"
```

Expected outcomes:
- Unauthenticated → `401 { error: "Unauthorized" }`
- FREE tier → `402 { error: "PRO subscription required" }`
- Connection already has any crawl job → `409 { error: "Index already started", jobId: "..." }`
- Success → `202 { ok: true, jobId: "...", state: "indexing" }`, and `SELECT * FROM crawl_jobs WHERE id = '<returned id>';` shows a PENDING (or already RUNNING) row.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/connections/[id]/search-index/trigger/route.ts"
git commit -m "feat(search-index): add manual trigger endpoint for initial crawl"
```

---

## Task 5: Add the `useTriggerSearchIndex` mutation hook

**Files:**
- Modify: `src/lib/queries/search-index.ts`

Adds the mutation that calls the new endpoint, with optimistic cache update and 402 → open-upgrade-modal handling.

- [ ] **Step 1: Update the imports**

Find the first line of `src/lib/queries/search-index.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
```

Replace with:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUpgradeModalStore } from "@/lib/stores/upgrade-modal-store";
```

- [ ] **Step 2: Append the mutation hook**

At the bottom of `src/lib/queries/search-index.ts` (after the closing `}` of `useSearchIndexStatus`), append:

```ts

type TriggerError = { status?: number; body?: { error?: string; jobId?: string } };

export function useTriggerSearchIndex() {
  const qc = useQueryClient();
  const openUpgrade = useUpgradeModalStore((s) => s.open);

  return useMutation<
    { ok: true; jobId: string; state: "indexing" },
    TriggerError,
    string
  >({
    mutationFn: async (connectionId) => {
      const res = await fetch(
        `/api/connections/${connectionId}/search-index/trigger`,
        { method: "POST" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw { status: res.status, body } satisfies TriggerError;
      return body as { ok: true; jobId: string; state: "indexing" };
    },
    onMutate: async (connectionId) => {
      await qc.cancelQueries({
        queryKey: queryKeys.searchIndex.status(connectionId),
      });
      const previous = qc.getQueryData<SearchIndexStatus>(
        queryKeys.searchIndex.status(connectionId),
      );
      qc.setQueryData<SearchIndexStatus>(
        queryKeys.searchIndex.status(connectionId),
        { state: "indexing", indexed: 0 },
      );
      return { previous };
    },
    onSuccess: (_data, connectionId) => {
      qc.invalidateQueries({
        queryKey: queryKeys.searchIndex.status(connectionId),
      });
    },
    onError: (err, connectionId) => {
      qc.invalidateQueries({
        queryKey: queryKeys.searchIndex.status(connectionId),
      });
      if (err?.status === 402) openUpgrade();
    },
  });
}
```

Note: `useUpgradeModalStore` is consumed inside the hook body (a React component context), so the standard `(s) => s.open` selector works — same pattern as `command-palette.tsx:79`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/search-index.ts
git commit -m "feat(search-index): add useTriggerSearchIndex mutation hook"
```

---

## Task 6: Build the `ConnectionIndexingCard` component

**Files:**
- Create: `src/components/connections/connection-indexing-card.tsx`

All seven variants live in one component, dispatching on `(tier, data.state)`. Header pattern + `Card` shell mirror `ConnectionPermissionsSummaryCard` so heights align in the grid.

- [ ] **Step 1: Write the file**

```tsx
"use client";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/components/info-drawer/format-time";
import { useTier } from "@/hooks/use-tier";
import { useUpgradeModalStore } from "@/lib/stores/upgrade-modal-store";
import {
  useSearchIndexStatus,
  useTriggerSearchIndex,
} from "@/lib/queries/search-index";

interface ConnectionIndexingCardProps {
  connectionId: string;
}

export function ConnectionIndexingCard({
  connectionId,
}: ConnectionIndexingCardProps) {
  const { tier, isLoading: tierLoading } = useTier();
  const openUpgrade = useUpgradeModalStore((s) => s.open);
  const { data, isLoading } = useSearchIndexStatus(connectionId);
  const trigger = useTriggerSearchIndex();

  // Locked variant — FREE tier upsell
  if (!tierLoading && tier === "FREE") {
    return (
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            Global search
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col flex-1">
          <p className="text-sm text-muted-foreground mb-4">
            Index your S3 contents to search across all buckets and connections
            from the command palette.
          </p>
          <Button size="sm" onClick={openUpgrade} className="self-start">
            <Sparkles className="h-3.5 w-3.5" />
            Upgrade to PRO
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Wait for status before deciding between hidden / empty / running / done / failed
  if (isLoading || !data) return null;

  // Hidden variant — env flag off
  if (data.state === "disabled") return null;

  const header = (
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-sm">
        <Search className="h-5 w-5 text-muted-foreground" />
        Search index
      </CardTitle>
    </CardHeader>
  );

  // Empty variant — never crawled
  if (data.state === "none") {
    return (
      <Card className="flex flex-col">
        {header}
        <CardContent className="flex flex-col flex-1">
          <p className="text-sm text-muted-foreground mb-4">
            This connection hasn&apos;t been indexed yet. Indexing scans all
            buckets so files appear in the command palette search.
          </p>
          <Button
            size="sm"
            disabled={trigger.isPending}
            onClick={() => trigger.mutate(connectionId)}
            className="self-start"
          >
            {trigger.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <Search className="h-3.5 w-3.5" />
                Index now
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Running variant — crawl in progress
  if (data.state === "indexing") {
    return (
      <Card className="flex flex-col">
        {header}
        <CardContent className="flex flex-col flex-1 gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="font-medium">
              Indexing… {data.indexed.toLocaleString()} objects
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            You can leave this page — it&apos;ll keep running.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Done variants — ready or partial (2M cap)
  if (data.state === "ready" || data.state === "partial") {
    const isPartial = data.state === "partial";
    const lastReconciledAt =
      data.state === "ready" ? data.lastReconciledAt : null;
    return (
      <Card className="flex flex-col">
        {header}
        <CardContent className="flex flex-col flex-1 items-center justify-center text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
          <p className="text-sm font-semibold mb-1">
            {data.indexed.toLocaleString()} objects indexed
            {isPartial ? " · 2M cap reached" : ""}
          </p>
          {isPartial ? (
            <p className="text-xs text-amber-600">
              Only the first 2M objects are searchable on this connection.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {lastReconciledAt
                ? `Last refreshed ${formatRelativeTime(lastReconciledAt)}`
                : "Just finished."}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Failed variant — error block
  if (data.state === "failed") {
    return (
      <Card className="flex flex-col">
        {header}
        <CardContent className="flex flex-col flex-1">
          <div className="bg-destructive/5 border border-destructive/40 rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">
                Indexing failed
              </span>
            </div>
            <p className="font-mono text-xs break-words">{data.message}</p>
            <p className="text-xs text-muted-foreground">
              This usually means credentials lost access to a bucket — check
              the Permissions tab.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/connections/connection-indexing-card.tsx
git commit -m "feat(search-index): add ConnectionIndexingCard with seven state variants"
```

---

## Task 7: Wire the card into `ConnectionOverviewTab`

**Files:**
- Modify: `src/components/connections/connection-overview-tab.tsx`

- [ ] **Step 1: Overwrite the file**

Replace the contents of `src/components/connections/connection-overview-tab.tsx` with:

```tsx
"use client";

import { ConnectionIdentityCard } from "./connection-identity-card";
import { ConnectionIndexingCard } from "./connection-indexing-card";
import { ConnectionPermissionsSummaryCard } from "./connection-permissions-summary-card";

interface ConnectionOverviewTabProps {
  connectionId: string;
}

export function ConnectionOverviewTab({
  connectionId,
}: ConnectionOverviewTabProps) {
  return (
    <div className="space-y-4">
      <ConnectionIdentityCard connectionId={connectionId} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ConnectionPermissionsSummaryCard connectionId={connectionId} />
        <ConnectionIndexingCard connectionId={connectionId} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/connections/connection-overview-tab.tsx
git commit -m "feat(search-index): show indexing card on connection overview tab"
```

---

## Task 8: Manual smoke test of every variant

**Files:** None (verification only).

Run `pnpm dev` and walk every variant. Pick a connection ID for each case — you may need to seed/modify the database directly with `pnpm prisma studio` or a SQL client.

- [ ] **Step 1: Locked variant (FREE tier)**

Sign in as a FREE user. Navigate to `/connections/<id>?tab=overview`. Expected:
- Card titled "Global search" with `Sparkles` icon (yellow).
- Body: "Index your S3 contents to search across all buckets and connections from the command palette."
- "Upgrade to PRO" button visible; clicking it opens the upgrade modal (`useUpgradeModalStore`).

- [ ] **Step 2: Hidden variant (env flag off)**

Stop the dev server, set `SEARCH_INDEX_ENABLED=false` in `.env.local`, restart `pnpm dev`. Sign in as a PRO user. Expected:
- The card slot in the Overview grid is empty (Permissions card is alone in its row).
- No console errors.

Restore `SEARCH_INDEX_ENABLED=true` before continuing.

- [ ] **Step 3: Empty variant (no crawl job)**

As a PRO user, pick a connection and delete any existing crawl jobs for it:

```sql
DELETE FROM crawl_jobs WHERE "connectionId" = '<connection-id>';
```

Reload `/connections/<id>?tab=overview`. Expected:
- Card titled "Search index", body explains the connection hasn't been indexed.
- "Index now" button visible.
- Clicking "Index now" disables the button, shows "Starting…" with a spinner.
- Within a few seconds the card flips to the Running variant ("Indexing… N objects").
- The `SearchIndexStatus` chip on the `/connections` list for this same connection also flips to "Indexing… N objects" without requiring a page reload (shared cache).

- [ ] **Step 4: Running variant**

Stay on the Overview page after triggering. Expected:
- Spinner + "Indexing… N objects" with N updating every 5s (poll interval from the hook).
- Helper text: "You can leave this page — it'll keep running."
- No "Index now" button.

- [ ] **Step 5: Done variant (ready)**

Wait for the crawl to complete (small test bucket = seconds; large ones = longer). Or simulate by updating the job row:

```sql
UPDATE crawl_jobs
SET status = 'COMPLETED', "completedAt" = NOW(), "objectsIndexed" = 1234
WHERE "connectionId" = '<id>';
```

Reload the page. Expected:
- Green `CheckCircle2` icon.
- "1,234 objects indexed" + subtitle "Last refreshed Xm ago" (or "Just finished." if `completedAt` is `NULL`).
- No button.

- [ ] **Step 6: Done-capped variant (partial)**

Force the partial state:

```sql
UPDATE crawl_jobs
SET status = 'PARTIAL_LIMIT_HIT', "completedAt" = NOW(), "objectsIndexed" = 2000000
WHERE "connectionId" = '<id>';
```

Reload. Expected:
- "2,000,000 objects indexed · 2M cap reached"
- Amber subtitle: "Only the first 2M objects are searchable on this connection."

- [ ] **Step 7: Failed variant**

Force the failed state:

```sql
UPDATE crawl_jobs
SET status = 'FAILED', "completedAt" = NOW(),
    "errorMessage" = 'AccessDenied: list-buckets call failed'
WHERE "connectionId" = '<id>';
```

Reload. Expected:
- Destructive-tinted block (red border + faint red bg).
- `AlertCircle` icon + "Indexing failed" title.
- Error message in `font-mono text-xs`: "AccessDenied: list-buckets call failed".
- Helper line about checking the Permissions tab.

- [ ] **Step 8: Double-trigger race**

Reset to the Empty state again:

```sql
DELETE FROM crawl_jobs WHERE "connectionId" = '<id>';
```

Reload the page. Open browser devtools → Network. Double-click "Index now" as fast as possible. Expected:
- First request: 202 success.
- Second request (if it slips past `mutation.isPending`): 409 with body `{ error: "Index already started", jobId: "..." }`.
- The card resolves to the Running variant either way (the `onError` invalidate re-fetches the true state).

---

## Self-Review (after implementation is complete)

After all tasks are merged, sanity-check:

- **Coverage:** Every spec requirement has a task:
  - Indexing card on connection overview → Tasks 6, 7
  - Manual trigger for uncrawled (none) connections → Tasks 4, 5, 6
  - No-trigger when ready/partial → Task 4 (409 guard) + Task 6 (no button rendered)
  - Cool failed UI → Task 6 (destructive-tinted block)
  - Locked FREE upsell → Task 6 (Locked variant) + spec answer
  - Hidden when env flag off → Task 6 (returns `null` on `state === "disabled"`)
  - Live progress count during indexing → Task 2 (5s poll) + Task 6 (Running variant copy)

- **Type consistency:**
  - `SearchIndexStatus` discriminated union defined in Task 2 is the same type narrowed in Task 6.
  - `queryKeys.searchIndex.status(connectionId)` key from Task 1 is used identically in Tasks 2 and 5.
  - Mutation `mutate(connectionId)` signature in Task 5 matches the call site in Task 6.

- **Cache sharing:** Tasks 2 and 3 ensure the chip and the card pull from the same query key, so a click on "Index now" in the card flips the chip on the connection list immediately.

- **No retry on Failed:** Per the design's "manual trigger only when never crawled" scope. The 409 guard in Task 4 plus the absence of any trigger UI in the Failed variant of Task 6 enforce this together.
