# Plan 029: Add "by file type" and "largest objects" to bucket storage stats

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d19fb78..HEAD -- src/lib/buckets/stats-helpers.ts src/app/api/buckets/[bucket]/stats/route.ts src/lib/queries/buckets.ts src/components/buckets/overview-storage-stats-card.tsx`
> If any changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `d19fb78`, 2026-06-22

## Why this matters

The bucket Overview already computes object count, total size, and a
storage-class breakdown by fully enumerating the bucket. That same enumeration
pass has everything needed to answer the two questions users actually ask of a
storage tool — **"what's taking up space?"** (breakdown by file type) and
**"which objects are biggest?"** (top-N largest). This plan extends the existing
stats accumulator and surfaces both in the existing Storage-stats card. It adds
**zero** new S3 calls: it enriches the single pass the card already runs.

## Current state

- `src/lib/buckets/stats-helpers.ts` — pure stats accumulator (whole file):
  ```ts
  export interface ObjectStatsAccumulator {
    count: number;
    size: number;
    byClass: Map<string, { count: number; size: number }>;
  }
  export interface StorageClassSummary { class: string; count: number; size: number; }
  export function emptyAccumulator(): ObjectStatsAccumulator {
    return { count: 0, size: 0, byClass: new Map() };
  }
  export function accumulateObjectStats(
    acc: ObjectStatsAccumulator,
    contents: Array<{ Size?: number; StorageClass?: string }>,
  ): ObjectStatsAccumulator { /* sums count/size, groups by StorageClass */ }
  export function summarizeStorageClasses(
    byClass: Map<string, { count: number; size: number }>,
  ): StorageClassSummary[] { /* sorted by size desc */ }
  ```
- `src/lib/buckets/stats-helpers.test.ts` — existing vitest coverage. Its
  fixtures pass entries shaped `{ Size, StorageClass }` (no `Key`). Your changes
  must keep these tests green (add `Key` as an **optional** field).
- `src/app/api/buckets/[bucket]/stats/route.ts` — enumerates the whole bucket
  and returns the summary (lines 36–56):
  ```ts
  let acc = emptyAccumulator();
  for (;;) {
    const response = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000, ContinuationToken: continuationToken }));
    acc = accumulateObjectStats(acc, response.Contents ?? []);
    if (!response.IsTruncated) break;
    continuationToken = response.NextContinuationToken ?? undefined;
  }
  return NextResponse.json({
    objectCount: acc.count, totalSize: acc.size,
    storageClasses: summarizeStorageClasses(acc.byClass),
  });
  ```
  `response.Contents` items are S3 `_Object`s — each has `Key`, `Size`,
  `StorageClass`, `LastModified`. `Key` is therefore already available to the
  accumulator; you just need to pass it through.
- `src/lib/queries/buckets.ts` — the client type + hook (lines 193–224):
  ```ts
  export interface BucketStats {
    objectCount: number;
    totalSize: number;
    storageClasses: Array<{ class: string; count: number; size: number }>;
  }
  export function useBucketStats(connectionId, bucket) {
    return useQuery({ queryKey: queryKeys.bucketStats.byBucket(connectionId, bucket),
      queryFn: () => fetchBucketStats(connectionId, bucket), enabled: false, staleTime: Infinity, gcTime: 5*60*1000 });
  }
  ```
- `src/components/buckets/overview-storage-stats-card.tsx` — renders the card.
  It is a manual-trigger card ("Compute stats" button → `stats.refetch()`),
  shows object count + total size in a grid, then a storage-class `<table>`
  (lines 89–114). `formatBytes` and `formatNumber` come from `@/lib/utils`.
- **Conventions:** pure helpers + colocated test (this file already follows it).
  Tables/labels in the card use `text-xs uppercase tracking-wider
  text-muted-foreground` headers and `formatBytes`/`formatNumber` for values —
  match that exactly for the new sections.

## Commands you will need

| Purpose   | Command                                       | Expected on success |
|-----------|-----------------------------------------------|---------------------|
| Tests     | `pnpm test`                                   | all pass            |
| One file  | `pnpm test -- src/lib/buckets/stats-helpers.test.ts` | old + new pass |
| Typecheck | `pnpm exec tsc --noEmit`                      | no **new** errors   |
| Lint      | `pnpm lint`                                   | no **new** problems |

**Baseline note (pre-plan-003):** capture baselines
(`pnpm exec tsc --noEmit 2>&1 | tee /tmp/tsc-before.txt`,
`pnpm lint 2>&1 | tee /tmp/lint-before.txt`); gate = no new errors/problems.
The 2 pre-existing `landing-page.test.tsx` tsc errors are out of scope.

## Scope

**In scope** (modify):
- `src/lib/buckets/stats-helpers.ts` — extend accumulator with extension +
  largest-object tracking
- `src/lib/buckets/stats-helpers.test.ts` — keep existing tests; add new ones
- `src/app/api/buckets/[bucket]/stats/route.ts` — return the new fields
- `src/lib/queries/buckets.ts` — extend the `BucketStats` type
- `src/components/buckets/overview-storage-stats-card.tsx` — render the new
  sections

**Out of scope** (do NOT touch):
- The ObjectIndex / crawl tables — this plan uses the live `ListObjectsV2`
  enumeration the card already runs, not the search index. Do not wire it to
  `object_index`.
- Adding a *separate* analytics page or route — extend the existing card.
- Time-series / growth-over-time — needs stored snapshots; explicitly deferred
  (see maintenance notes).

## Git workflow

- Branch: `advisor/029-storage-analytics`
- Commit style: conventional commits (e.g.
  `feat(buckets): break storage stats down by file type and largest objects`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Extend the pure accumulator (keep existing tests green)

Edit `src/lib/buckets/stats-helpers.ts`. Add extension grouping and a bounded
top-N largest list. Make `Key` **optional** on the input entry so the existing
tests (which omit it) still pass.

```ts
export interface ObjectStatsAccumulator {
  count: number;
  size: number;
  byClass: Map<string, { count: number; size: number }>;
  byExtension: Map<string, { count: number; size: number }>;
  largest: Array<{ key: string; size: number }>; // sorted size desc, capped at LARGEST_N
}

export interface StorageClassSummary { class: string; count: number; size: number; }
export interface ExtensionSummary { ext: string; count: number; size: number; }

export const LARGEST_N = 10;

export function emptyAccumulator(): ObjectStatsAccumulator {
  return { count: 0, size: 0, byClass: new Map(), byExtension: new Map(), largest: [] };
}

/** lowercased extension without the dot, or "(none)" for extensionless / dotfiles / folder markers. */
export function extensionOf(key: string): string {
  const slash = key.lastIndexOf("/");
  const name = slash === -1 ? key : key.slice(slash + 1);
  if (name === "") return "(none)"; // folder placeholder key ending in "/"
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "(none)";
  return name.slice(dot + 1).toLowerCase();
}

function trackLargest(largest: Array<{ key: string; size: number }>, key: string, size: number): void {
  if (largest.length < LARGEST_N) {
    largest.push({ key, size });
    largest.sort((a, b) => b.size - a.size);
  } else if (size > largest[largest.length - 1].size) {
    largest[largest.length - 1] = { key, size };
    largest.sort((a, b) => b.size - a.size);
  }
}

export function accumulateObjectStats(
  acc: ObjectStatsAccumulator,
  contents: Array<{ Key?: string; Size?: number; StorageClass?: string }>,
): ObjectStatsAccumulator {
  for (const entry of contents) {
    const size = entry.Size ?? 0;
    const cls = entry.StorageClass ?? "STANDARD";
    acc.count += 1;
    acc.size += size;

    const priorClass = acc.byClass.get(cls);
    if (priorClass) { priorClass.count += 1; priorClass.size += size; }
    else acc.byClass.set(cls, { count: 1, size });

    const ext = entry.Key ? extensionOf(entry.Key) : "(none)";
    const priorExt = acc.byExtension.get(ext);
    if (priorExt) { priorExt.count += 1; priorExt.size += size; }
    else acc.byExtension.set(ext, { count: 1, size });

    if (entry.Key) trackLargest(acc.largest, entry.Key, size);
  }
  return acc;
}

export function summarizeStorageClasses(/* unchanged */) { /* keep as-is */ }

export function summarizeExtensions(
  byExtension: Map<string, { count: number; size: number }>,
): ExtensionSummary[] {
  return Array.from(byExtension.entries())
    .map(([ext, v]) => ({ ext, count: v.count, size: v.size }))
    .sort((a, b) => b.size - a.size);
}
```

Keep `summarizeStorageClasses` exactly as it is.

**Verify**: `pnpm test -- src/lib/buckets/stats-helpers.test.ts` → the existing
tests still pass.

### Step 2: Add tests for the new helpers

Append to `src/lib/buckets/stats-helpers.test.ts` (same `describe`/`test`/`expect`
style). Cover:
- `extensionOf`: `"a/photo.JPG"` → `"jpg"` (lowercased); nested key; no-extension
  key (`"a/README"`) → `"(none)"`; dotfile (`"a/.env"`) → `"(none)"`; folder
  marker key (`"a/sub/"`) → `"(none)"`; double extension (`"a/x.tar.gz"`) →
  `"gz"`.
- `accumulateObjectStats` with `Key`: groups by extension and sums sizes;
  entries **without** `Key` fall into `"(none)"`.
- `largest`: tracks only the top `LARGEST_N` by size; given 12 objects of sizes
  1..12, `acc.largest` has length 10, is sorted descending, and the two
  smallest (1 and 2) are excluded; ties don't crash.
- `summarizeExtensions`: empty map → `[]`; sorted by size descending.
- Add one assertion to the **existing** "sums multiple objects" style test (or a
  new test) confirming `emptyAccumulator().byExtension.size === 0` and
  `.largest.length === 0`.

**Verify**: `pnpm test -- src/lib/buckets/stats-helpers.test.ts` → all old + new
tests pass.

### Step 3: Return the new fields from the route

In `src/app/api/buckets/[bucket]/stats/route.ts`, import `summarizeExtensions`
and extend the JSON response (the accumulation loop needs no change — `Contents`
already carries `Key`):

```ts
return NextResponse.json({
  objectCount: acc.count,
  totalSize: acc.size,
  storageClasses: summarizeStorageClasses(acc.byClass),
  extensions: summarizeExtensions(acc.byExtension),
  largestObjects: acc.largest, // already sorted desc, capped at 10
});
```

**Verify**: `pnpm exec tsc --noEmit` → no new errors.

### Step 4: Extend the `BucketStats` client type

In `src/lib/queries/buckets.ts`, add the two fields to `BucketStats`:

```ts
export interface BucketStats {
  objectCount: number;
  totalSize: number;
  storageClasses: Array<{ class: string; count: number; size: number }>;
  extensions: Array<{ ext: string; count: number; size: number }>;
  largestObjects: Array<{ key: string; size: number }>;
}
```

**Verify**: `pnpm exec tsc --noEmit` → no new errors.

### Step 5: Render the new sections in the card

In `src/components/buckets/overview-storage-stats-card.tsx`, inside the
`hasData && !stats.isFetching` block, **after** the storage-class table (after
line 114), add two sections, matching the existing table/label styling:

1. **By file type** — a table like the storage-class one, columns
   `Type | Count | Size`, rows from `stats.data.extensions` (cap the rendered
   rows at the top 8; if more, you may show a final "+N more types" row, or just
   the top 8 — the data is already sorted by size desc). Show the section only
   when `stats.data.extensions.length > 0`. Render `(none)` as e.g. "no
   extension" if you prefer, but the raw value is acceptable.
2. **Largest objects** — a simple list/table of `stats.data.largestObjects`
   (already top-10, sorted), showing the object key (use a `font-mono text-xs
   truncate` cell with `title={key}` so long keys don't overflow) and
   `formatBytes(size)` right-aligned. Show only when the array is non-empty.

Use `formatBytes`/`formatNumber` (already imported at line 6) for all numbers.
Do not add new "Compute" buttons — these render from the same `stats.data` the
existing "Compute stats"/"Refresh" actions populate.

**Verify**: `pnpm exec tsc --noEmit` → no new errors; `pnpm lint` → no new
problems vs baseline.

## Test plan

- `src/lib/buckets/stats-helpers.test.ts` — existing tests stay green
  (backward-compat proof) **plus** the new cases in Step 2 (extension grouping,
  top-N largest, summarizeExtensions). This is the only logic that can be wrong;
  it carries the test weight.
- No test for the route or card (no live S3 / render harness for these). The
  route change is a pure passthrough of tested helpers; the card is presentation.
- Verification: `pnpm test` → all pass, including the new stats-helper cases.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test` exits 0; new stats-helper tests exist and pass; **old** ones
      still pass
- [ ] `pnpm exec tsc --noEmit` → no errors beyond the 2 pre-existing
      `landing-page.test.tsx` ones
- [ ] `pnpm lint` → no new problems vs baseline
- [ ] `grep -n "summarizeExtensions\|largestObjects" src/app/api/buckets/\[bucket\]/stats/route.ts`
      returns the new response fields
- [ ] `grep -n "extensions\|largestObjects" src/lib/queries/buckets.ts` shows the
      extended type
- [ ] `git status` shows only the 5 in-scope files
- [ ] `plans/README.md` status row for 029 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `stats-helpers.ts` or its test no longer match the excerpts (drifted) — in
  particular if `accumulateObjectStats` already takes `Key` or already tracks
  extensions (someone got there first).
- Making the existing tests pass would require changing their fixtures — it
  should not; `Key` is optional. If a test breaks, you changed a signature
  incompatibly; revert and make `Key` optional.
- The route's accumulation loop is no longer `accumulateObjectStats(acc, response.Contents ?? [])`.
- A verification fails twice after a reasonable fix.

## Maintenance notes

- This reuses the **full-enumeration** stats pass, which is already gated behind
  a manual "Compute stats" button because it can be slow on large buckets — the
  new sections inherit that gating for free. Don't make it auto-run.
- `LARGEST_N` is 10 and the extension table renders the top 8; both are cheap,
  bounded, and don't grow with bucket size. If product wants more, bump the
  constant and the render cap together.
- A reviewer should confirm the **existing** `stats-helpers.test.ts` cases were
  not modified (only added to) — that's the proof the change is backward
  compatible for any other caller of the accumulator.
- Deferred (needs new storage, out of scope): growth-over-time / trend charts
  (requires persisting periodic stats snapshots — a schema + cron change), and
  per-prefix ("folder") size rollups. Note either as a follow-up plan if asked.
