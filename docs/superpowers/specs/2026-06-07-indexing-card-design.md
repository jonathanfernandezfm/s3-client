# Indexing Card on Connection Overview Design

## Goal

Add a self-contained "Search index" card to the connection Overview tab that surfaces the current crawl/indexing state for the connection and lets users who have never been indexed kick off an initial crawl manually. Reuses the existing `CrawlJob` pipeline; introduces one new user-facing trigger endpoint and one new shared status hook.

## Motivation

Today, the search index is enqueued automatically on connection creation for PRO users and topped up by an hourly RECONCILE cron. There is no user-facing way to:
1. See whether *this* connection has been indexed (status is only surfaced as a tiny chip in the connection list).
2. Trigger indexing for a connection that has no crawl job — e.g. a connection that pre-dates auto-enqueue, or one where the auto-enqueue silently failed because `INTERNAL_API_TOKEN` was unset at the time.
3. Understand why indexing failed when it did.

This card is the missing UI for those three needs, sitting alongside the existing Permissions summary card on the connection Overview tab.

## Architecture

A single client component `ConnectionIndexingCard` reads connection-scoped index state from a new shared React Query hook `useSearchIndexStatus`, and renders one of seven variants based on `(tier, state)`. A second hook `useTriggerSearchIndex` posts to a new `/api/connections/[id]/search-index/trigger` endpoint that creates a `CrawlJob` row with `kind = INITIAL` and fires the existing internal crawl runner — mirroring the fire-and-forget pattern used by `/api/internal/reconcile`.

The existing inline chip at `src/components/connections/search-index-status.tsx` is refactored to consume the same shared hook so its cache is shared with the card. When a user clicks "Index now" in the card, the chip in the connection list flips to "Indexing…" through cache propagation without an extra fetch.

## File Map

| Path | Op | Responsibility |
|---|---|---|
| `src/components/connections/connection-indexing-card.tsx` | Create | New card with seven state variants (locked / hidden / empty / running / done / done-capped / failed) |
| `src/lib/queries/search-index.ts` | Create | Shared `useSearchIndexStatus(connectionId)` query hook + `useTriggerSearchIndex()` mutation hook |
| `src/app/api/connections/[id]/search-index/trigger/route.ts` | Create | `POST` endpoint that creates an INITIAL `CrawlJob` and fires `/api/internal/crawl` |
| `src/components/connections/connection-overview-tab.tsx` | Modify | Drop `ConnectionIndexingCard` into the 2-column grid next to `ConnectionPermissionsSummaryCard` |
| `src/lib/queries/keys.ts` | Modify | Add `searchIndex: { all, status(id) }` key namespace |
| `src/components/connections/search-index-status.tsx` | Modify | Replace inline `useQuery` with the shared hook (no behavior change, just cache sharing) |

## State Machine

The card resolves its variant from `tier` (from `useTier()`) and `state` (from the status API). The header row is `<Search className="h-5 w-5 text-muted-foreground" />` + "Search index" in all non-Locked variants; the Locked variant uses `<Sparkles className="h-5 w-5 text-yellow-500" />` + "Global search".

| Condition | Variant | Visual |
|---|---|---|
| `tier === "FREE"` | **Locked** | Sparkles header, body "Index your S3 contents to search across all buckets and connections from the command palette", primary `Upgrade →` button that calls `useUpgradeModalStore().open()` |
| `state === "disabled"` | **Hidden** | Returns `null`. Triggered when the `SEARCH_INDEX_ENABLED` env flag is off — admin-side config, no point showing |
| `state === "none"` | **Empty** | Body "This connection hasn't been indexed yet. Indexing scans all buckets so files appear in the command palette search.", primary `Index now` button that fires the trigger mutation. Button shows `Loader2` + "Starting…" while `mutation.isPending` |
| `state === "indexing"` | **Running** | `Loader2` spinner + "Indexing… {count.toLocaleString()} objects" (live count, auto-polls every 5s via existing `refetchInterval`), helper text "You can leave this page — it'll keep running." |
| `state === "ready"` | **Done** | `CheckCircle2` (`text-green-500`) + "{count.toLocaleString()} objects indexed", subtitle "Last refreshed {formatRelativeTime(lastReconciledAt)}" using the existing `@/components/info-drawer/format-time` helper; no button. If `lastReconciledAt` is null, subtitle reads "Just finished." |
| `state === "partial"` | **Done (capped)** | Same as ready but title "{count.toLocaleString()} objects indexed · 2M cap reached" with an amber-tinted hint "Only the first 2M objects are searchable on this connection." |
| `state === "failed"` | **Failed** | Inside a `bg-destructive/5 border border-destructive/40 rounded-md p-3` block: `AlertCircle` icon + "Indexing failed" title, the API's `message` field rendered in `font-mono text-xs`, helper line "This usually means credentials lost access to a bucket — check the Permissions tab." No retry button (per scope decision). |

## Trigger Endpoint

`POST /api/connections/[id]/search-index/trigger` — protected by `withAuth`.

**Validation order (each returns immediately on failure):**
1. `isSearchIndexEnabled()` → 503 `{ error: "Search indexing not available" }` if env flag is off.
2. `getConnectionAccessById(id, user.id)` → 404 `{ error: "Not found" }` if user can't reach this connection (matches the pattern in the existing status route).
3. Tier check — `user.subscription?.tier` must be `"PRO"` or `"ENTERPRISE"`, else 402 `{ error: "PRO subscription required" }`.
4. No-existing-job guard — `prisma.crawlJob.findFirst({ where: { connectionId: id } })` must return `null`, else 409 `{ error: "Index already started", jobId: existing.id }`. The client invalidates its status cache on 409 and re-fetches the real state from the GET endpoint. This is the on-server enforcement of "if crawling has been done, don't allow it" and prevents two concurrent INITIAL jobs from racing.

**On success:**
1. `prisma.crawlJob.create({ data: { connectionId: id, kind: "INITIAL", status: "PENDING", bucketsRemaining: [] } })` — same shape as the reconcile route's create call.
2. Fire-and-forget POST to `${req.nextUrl.origin}/api/internal/crawl?jobId=<id>` with the `x-internal-token` header. Reuse the existing `fireCrawl` pattern from `/api/internal/reconcile/route.ts:14-23`. If `INTERNAL_API_TOKEN` is missing, log and skip; `/api/internal/reconcile`'s stale-pending rescue picks the job up on the next cron tick.
3. Return `202 { ok: true, jobId, state: "indexing" }`.

The fire-and-forget call cannot be awaited (it triggers the same route the call originates from in dev, and a server-to-self fetch can deadlock on the dev server's single worker). Mirror the reconcile route's `.catch()` logging exactly.

## Hooks

**`src/lib/queries/search-index.ts`:**

```ts
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
      const res = await fetch(`/api/connections/${connectionId}/search-index-status`);
      if (!res.ok) return { state: "disabled" };
      return res.json();
    },
    refetchInterval: (q) => (q.state.data?.state === "indexing" ? 5_000 : false),
    staleTime: 10_000,
  });
}

export function useTriggerSearchIndex() {
  const qc = useQueryClient();
  const openUpgrade = useUpgradeModalStore((s) => s.open);
  return useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch(`/api/connections/${connectionId}/search-index/trigger`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw { status: res.status, body };
      return body as { ok: true; jobId: string; state: "indexing" };
    },
    onMutate: async (connectionId) => {
      await qc.cancelQueries({ queryKey: queryKeys.searchIndex.status(connectionId) });
      qc.setQueryData<SearchIndexStatus>(queryKeys.searchIndex.status(connectionId), {
        state: "indexing",
        indexed: 0,
      });
    },
    onSuccess: (_data, connectionId) => {
      qc.invalidateQueries({ queryKey: queryKeys.searchIndex.status(connectionId) });
    },
    onError: (err: { status?: number; body?: { error?: string } }, connectionId) => {
      qc.invalidateQueries({ queryKey: queryKeys.searchIndex.status(connectionId) });
      if (err?.status === 402) openUpgrade();
    },
  });
}
```

Optimistic update on `onMutate` flips the UI to "Indexing…" instantly; `onError` rolls back by invalidating, so a 409 cleanly reverts to whatever state the server actually has.

## Key Namespace

In `src/lib/queries/keys.ts` add:

```ts
searchIndex: {
  all: ["search-index"] as const,
  status: (connectionId: string) =>
    [...queryKeys.searchIndex.all, "status", connectionId] as const,
},
```

The existing `search-index-status.tsx` chip currently uses an ad-hoc `["search-index-status", connectionId]` key. Refactoring it onto `queryKeys.searchIndex.status(connectionId)` is what makes cache-sharing between the card and the chip actually work.

## Wiring

In `src/components/connections/connection-overview-tab.tsx`, add the card to the grid:

```tsx
<div className="space-y-4">
  <ConnectionIdentityCard connectionId={connectionId} />
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <ConnectionPermissionsSummaryCard connectionId={connectionId} />
    <ConnectionIndexingCard connectionId={connectionId} />
  </div>
</div>
```

When the card returns `null` (Hidden variant), the grid collapses gracefully — the Permissions card keeps its column and an empty slot sits next to it on desktop, which matches the existing single-card layout.

## Edge Cases

- **Connection-not-found** → status API returns 404, hook treats it as `disabled` (the existing fallback), card hides. The parent route surfaces "connection not found" elsewhere.
- **Tier downgrade between page load and click** → trigger returns 402, mutation rolls back the optimistic cache and opens the upgrade modal. Card returns to `none` state.
- **Status flips `indexing` → `ready` while open** → 5s poll picks it up automatically.
- **Double-click `Index now`** → first click flips local cache to `indexing` and `mutation.isPending` disables the button. A race that gets through returns 409; mutation handler invalidates the cache and the card resolves to the real server state.
- **Manual trigger when `INTERNAL_API_TOKEN` is unset** → job is created in PENDING but the fire-and-forget call is silently skipped (same as reconcile). The stale-pending sweep in the reconcile cron rescues it on the next tick. UI shows "Indexing… 0 objects" until then.
- **Connection deleted while job is running** → `Connection` has `onDelete: Cascade` on `CrawlJob`, so the job row goes away with it. The card unmounts with the page.

## Out of Scope

- Retry button on the Failed variant. Per scope, failed crawls are not user-retriable; the reconcile cron eventually re-enqueues after the interval. If real-world failure rates make this painful, revisit in a follow-up.
- Per-bucket indexing status. The card is connection-scoped only.
- Progress bar or remaining-bucket estimate. Live object count covers the in-progress need without extending the status API.
- Re-indexing a connection that's already `ready` or `partial`. Reconcile handles freshness; manual re-trigger would be a separate "Rebuild index" feature.
- Tests for the new trigger endpoint or hook. Thin glue over an existing pipeline that has its own coverage (`walk.test.ts`); revisit if logic grows.
