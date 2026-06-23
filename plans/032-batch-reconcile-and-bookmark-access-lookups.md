# Plan 032: Eliminate two per-item query loops (reconcile cron + bookmark access checks)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/app/api/internal/reconcile/route.ts src/lib/db/bookmarks.ts src/lib/db/connections.ts`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

Two code paths issue one database query **per item** in a loop where a single
batched query would do:

1. **Reconcile cron** (`internal/reconcile/route.ts`) runs on a schedule over
   every PRO/ENTERPRISE connection and, for each one, issues a separate
   `findFirst` to check for a recent crawl job (lines 89-100). With N eligible
   connections that is N sequential round-trips before any job is queued; the
   rescue loops above it also `await` one `update`/`fire` per stuck/pending job
   serially.
2. **Bookmarks list** (`db/bookmarks.ts:listBookmarks`) calls
   `getConnectionAccessById` once per bookmark (lines 27-31). Each call is a
   `findUnique` **plus an AES-GCM `decrypt`** of the connection secret. A user
   with 20 bookmarks pays 20 sequential queries + 20 decrypts every time the
   sidebar loads — on a user-facing path.

Both are textbook N+1s. Batching the reconcile recency check into one query and
resolving bookmark access once per *unique connection* removes the per-item
round-trips with no behavior change.

## Current state

### Reconcile route

`src/app/api/internal/reconcile/route.ts` — internal, token-guarded
(`checkInternalAuth`, line 8-12), `POST`/`GET` cron entrypoint.

- Lines 40-50, stuck-job rescue — serial update + fire per job:
  ```ts
  const stuck = await prisma.crawlJob.findMany({
    where: { status: "RUNNING", lastTickAt: { lt: stuckThreshold } },
    select: { id: true },
  });
  for (const j of stuck) {
    await prisma.crawlJob.update({ where: { id: j.id }, data: { status: "PENDING" } });
    await fireCrawl(j.id, req.nextUrl.origin);
  }
  ```
- Lines 88-111, the N+1 — `findFirst` per connection, then create + fire:
  ```ts
  const fired: string[] = [];
  for (const conn of connections) {
    const recent = await prisma.crawlJob.findFirst({
      where: {
        connectionId: conn.id,
        kind: "RECONCILE",
        OR: [
          { status: "RUNNING" },
          { status: { in: ["COMPLETED", "PARTIAL_LIMIT_HIT", "FAILED"] }, completedAt: { gte: reconcileThreshold } },
        ],
      },
    });
    if (recent) continue;
    const job = await prisma.crawlJob.create({
      data: { connectionId: conn.id, kind: "RECONCILE", status: "PENDING", bucketsRemaining: [] },
    });
    await fireCrawl(job.id, req.nextUrl.origin);
    fired.push(job.id);
  }
  ```
- `fireCrawl` (lines 14-23) is already fire-and-forget: it calls `fetch(...)`
  WITHOUT awaiting it (only `.catch`), and returns `void`. So `await fireCrawl`
  only awaits the synchronous setup — the cost in the loops is the
  `prisma.crawlJob.update`/`create` awaits, not the fetch.
- The response reports `stuck.length`, `stalePending.length`, `fired.length`
  (lines 113-118) — your refactor must preserve those counts.
- `CrawlJob` has `@@index([connectionId, kind, status])`
  (`prisma/schema.prisma:453`), so a single `findMany` filtered by
  `connectionId in [...]`, `kind: "RECONCILE"` is index-friendly.

### Bookmarks list

`src/lib/db/bookmarks.ts:5-45` — `listBookmarks(userId, connectionId?, bucket?)`:

```ts
const bookmarks = await prisma.bookmark.findMany({ where, include: { connection: { select: { name: true, endpoint: true } } }, orderBy: [...] });
const results: BookmarkResponse[] = [];
for (const bm of bookmarks) {
  const access = await getConnectionAccessById(bm.connectionId, userId);   // <-- N+1: query + decrypt per bookmark
  if (!access) continue;
  results.push({ id: bm.id, connectionId: bm.connectionId, connectionName: bm.connection.name || bm.connection.endpoint, bucket: bm.bucket, prefix: bm.prefix, label: bm.label, createdAt: bm.createdAt.toISOString() });
}
return results;
```

- `getConnectionAccessById` (`src/lib/db/connections.ts:136-186`) does a
  `prisma.connection.findUnique` with a workspace+team include AND
  `decrypt(connection.secretAccessKey)`. The access result is used here only as
  a boolean gate (`if (!access) continue`) — the decrypted secret is discarded.
- Bookmarks for one user routinely point at the **same few connections**, so the
  distinct-connection count is usually far smaller than the bookmark count.

Repo conventions: db helpers are plain async functions in `src/lib/db/*` using
the shared `prisma` singleton; existing unit tests in `src/lib/db/*.test.ts`
mock `./prisma`. Pure list/group transforms that don't need Prisma should be
extracted and unit-tested directly (see how `query-helpers.ts` is split from the
activity route and tested in isolation).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Targeted tests | `pnpm test -- src/lib/db src/app/api/internal` | all pass |
| Full suite | `pnpm test` | all pass (≥ 670 + new) |

## Scope

**In scope** (modify or create):
- `src/app/api/internal/reconcile/route.ts` — batch the recency check; reduce
  serial awaits.
- `src/lib/db/bookmarks.ts` — resolve access once per unique connection.
- `src/lib/db/bookmarks.test.ts` (create if absent) — cover the dedup behavior.
- Optionally a small pure helper file if you extract grouping logic (e.g.
  `src/app/api/internal/reconcile/recency.ts` + `.test.ts`) — keep it minimal.

**Out of scope** (do NOT touch):
- `src/lib/db/connections.ts` — `getConnectionAccessById` stays as is; you call
  it fewer times, you don't change it.
- `prisma/schema.prisma` — no schema/index change. The existing
  `@@index([connectionId, kind, status])` already serves the batched query.
- `fireCrawl`'s fire-and-forget design — keep it; the deferred fetch is
  intentional (documented elsewhere in the search-index code).
- Auth/token checks in the reconcile route.

## Git workflow

- Shared checkout — run `git branch --show-current` before committing.
- Branch: `perf/032-batch-query-loops`.
- Commits, conventional style:
  `perf: batch reconcile recency check into one query` and
  `perf: resolve bookmark access once per connection`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Batch the reconcile recency check

Replace the per-connection `findFirst` loop (lines 88-111) with: one
`findMany` that fetches the "recent" RECONCILE jobs for all candidate
connections, build a `Set<connectionId>` of those that already have one, then
create jobs only for the connections NOT in that set.

```ts
const connectionIds = connections.map((c) => c.id);
const recentJobs = connectionIds.length === 0 ? [] : await prisma.crawlJob.findMany({
  where: {
    connectionId: { in: connectionIds },
    kind: "RECONCILE",
    OR: [
      { status: "RUNNING" },
      { status: { in: ["COMPLETED", "PARTIAL_LIMIT_HIT", "FAILED"] }, completedAt: { gte: reconcileThreshold } },
    ],
  },
  select: { connectionId: true },
});
const haveRecent = new Set(recentJobs.map((j) => j.connectionId));
const toQueue = connections.filter((c) => !haveRecent.has(c.id));

const fired: string[] = [];
for (const conn of toQueue) {
  const job = await prisma.crawlJob.create({
    data: { connectionId: conn.id, kind: "RECONCILE", status: "PENDING", bucketsRemaining: [] },
  });
  fireCrawl(job.id, req.nextUrl.origin);   // fire-and-forget; no await needed
  fired.push(job.id);
}
```

Keep the response shape (`reconcileQueued: fired.length`) identical. The
semantics are unchanged: a connection gets a new job iff it had no RUNNING and
no recent terminal RECONCILE job.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Reduce serial awaits in the rescue loops

For the stuck-job loop (lines 44-50), do the status reset in one `updateMany`
and then fire each (fire-and-forget, no await):

```ts
const stuck = await prisma.crawlJob.findMany({ where: { status: "RUNNING", lastTickAt: { lt: stuckThreshold } }, select: { id: true } });
if (stuck.length > 0) {
  await prisma.crawlJob.updateMany({ where: { id: { in: stuck.map((j) => j.id) } }, data: { status: "PENDING" } });
  for (const j of stuck) fireCrawl(j.id, req.nextUrl.origin);
}
```

For the stale-pending loop (lines 52-59) just drop the per-item `await` on
`fireCrawl` (it's fire-and-forget): `for (const j of stalePending) fireCrawl(j.id, req.nextUrl.origin);`.

**Verify**: `pnpm typecheck` → exit 0; the response still returns
`stuckRescued: stuck.length`, `pendingRescued: stalePending.length`.

### Step 3: Resolve bookmark access once per unique connection

In `src/lib/db/bookmarks.ts:listBookmarks`, replace the per-bookmark
`getConnectionAccessById` with a per-unique-connection resolution:

```ts
const uniqueConnectionIds = [...new Set(bookmarks.map((bm) => bm.connectionId))];
const accessById = new Map<string, boolean>();
await Promise.all(
  uniqueConnectionIds.map(async (cid) => {
    const access = await getConnectionAccessById(cid, userId);
    accessById.set(cid, access !== null);
  })
);

const results: BookmarkResponse[] = [];
for (const bm of bookmarks) {
  if (!accessById.get(bm.connectionId)) continue;
  results.push({ /* ...same fields as today... */ });
}
return results;
```

Behavior is identical (a bookmark is included iff its connection is accessible),
but each connection is resolved once instead of once per bookmark, and the
lookups run concurrently. Keep the pushed object's fields exactly as the current
code produces them.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Unit-test the bookmark dedup

Create `src/lib/db/bookmarks.test.ts` (if absent). Mock `./prisma` and
`./connections` (`getConnectionAccessById`). Assert, for three bookmarks across
two distinct connection ids where one connection resolves to `null` access:

1. `getConnectionAccessById` is called exactly **2** times (once per unique
   connection), not 3.
2. The returned list excludes bookmarks whose connection resolved to `null`.
3. The returned objects carry the expected `connectionName` fallback
   (`name || endpoint`).

Follow the mocking style of an existing `src/lib/db/*.test.ts` if one exists; if
none does, mirror the `vi.mock("@/lib/db/prisma", ...)` pattern used in the
object-route tests.

**Verify**: `pnpm test -- src/lib/db/bookmarks` → all pass, including the
"called twice" assertion.

### Step 5: Full gate

**Verify**: `pnpm test` (all pass), `pnpm typecheck` (exit 0),
`pnpm lint` (exit 0).

## Test plan

- `src/lib/db/bookmarks.test.ts` (new): the dedup test above — the key
  regression guard is "N bookmarks over K connections ⇒ K access lookups".
- If you extract a pure recency-grouping helper for the reconcile route, add a
  `.test.ts` asserting: given a candidate id list and a set of jobs, it returns
  exactly the ids with no recent job. (Optional — only if you extracted it.)
- The reconcile route itself has no integration harness; rely on typecheck +
  the preserved response-count assertions + manual reasoning. Do NOT build a
  cron integration test.
- Verification: `pnpm test` → all pass with new cases.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0; `bookmarks.test.ts` asserts access is resolved once
      per unique connection
- [ ] `grep -n "findFirst" src/app/api/internal/reconcile/route.ts` returns
      nothing (the per-connection `findFirst` is gone)
- [ ] `grep -n "getConnectionAccessById" src/lib/db/bookmarks.ts` shows it called
      inside a per-unique-connection map, not inside the `for (const bm ...)` loop
- [ ] The reconcile response still returns `stuckRescued`, `pendingRescued`,
      `reconcileQueued` with the same meaning
- [ ] `git diff --stat -- prisma/schema.prisma` is empty
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The reconcile recency logic in "Current state" no longer matches (the OR
  conditions or thresholds changed) — the batched query must reproduce the live
  semantics exactly; if you can't, stop.
- `getConnectionAccessById`'s return contract changed (no longer `null`-or-object)
  — the boolean gate assumption breaks.
- A verification fails twice after a reasonable fix attempt.
- You find a caller relying on `listBookmarks` doing a *fresh* per-bookmark
  access check for a side effect (it should not — the result is used only as a
  filter) — if so, report before changing.

## Maintenance notes

- The bookmark dedup assumes access does not vary *within* a single
  `listBookmarks` call for the same connection (it can't — same user, same
  connection). If bookmarks ever gain per-bookmark ACLs distinct from connection
  access, revisit.
- The reconcile batching assumes the candidate `connections` list is bounded by
  the existing PRO/ENTERPRISE `where` filter (lines 63-87). If that filter is
  removed, add a `take`/pagination — a single `in: [...]` with thousands of ids
  is itself a cost. Flagged so a reviewer watching that query keeps the bound.
- Considered and not done this round (low leverage): the `trackLargest`
  re-sort-on-insert in `src/lib/buckets/stats-helpers.ts:37-49` (the sort almost
  never fires after the top-10 warms up, so the win is negligible) and an
  `ActivityEvent` `(connectionId, bucket, userId, createdAt)` composite index
  (the existing `[connectionId, bucket, createdAt desc]` index already serves
  the dominant unfiltered activity query; the userId filter is a rare secondary
  path).
