# Plan 006: Batch search-index mutations and stop silently truncating presign-batch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 6dbaee9..HEAD -- src/lib/search/index-ops.ts src/app/api/objects/delete/route.ts src/app/api/objects/copy/route.ts src/app/api/objects/move/route.ts src/app/api/objects/presign-batch/route.ts src/lib/queries/presign.ts src/components/browser`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (adds new helpers, replaces hot-loop call sites; semantics unchanged)
- **Depends on**: [[003-clean-verification-baseline]]
- **Category**: perf + bug
- **Planned at**: commit `6dbaee9`, 2026-06-13

## Why this matters

Two unrelated wins, bundled because they live in the same `src/app/api/objects/`
neighborhood and each is a one-evening fix.

### Win 1 — search-index N+1

For every search-indexed mutation, the route fires N separate DB calls
instead of one. Concretely:

- `src/app/api/objects/delete/route.ts:62` →
  `await Promise.all(keys.map((k) => indexDelete({ connectionId, bucket, key: k })));`
  100 deletes = 100 `prisma.objectIndex.deleteMany({ where: { key: oneKey } })`
  round trips, each its own transaction.
- `src/app/api/objects/copy/route.ts:151-163` → after a folder copy,
  `Promise.all(successfulResults.map((r) => indexUpsert({…})))`. 500-file copy
  = 500 separate `upsert` calls.
- `src/app/api/objects/move/route.ts:172-187` → twice: an `indexDelete` per
  source key AND an `indexUpsert` per target key, all inside the same
  `Promise.all`. 100-file move = 200 individual queries.

A batched helper already exists for inserts (`indexBulkUpsert` at
`src/lib/search/index-ops.ts:64-90`, raw SQL `INSERT … ON CONFLICT` over
the full batch). There is no batched delete equivalent and the copy/move
hot loops never call `indexBulkUpsert` for upserts.

Impact at S3-typical batch sizes (50–1000 keys per request): one round trip
becomes the bottleneck instead of N. The DB connection pool stops thrashing
under bulk operations. The fix is contained and verifiable without changing
any externally observable behavior.

### Win 2 — presign-batch silent truncation

`src/app/api/objects/presign-batch/route.ts:24` →
`const cappedKeys = keys.slice(0, 200);`. If a caller asks for 500
presigned URLs the route returns URLs for the first 200 and reports
nothing about the rest. Downstream code (`src/lib/queries/presign.ts` and
its callers in the browser components) then tries to use missing URLs and
shows generic errors with no actionable signal to the user.

Two fixes are equally valid; pick A unless smoke testing shows it
regresses a high-value flow:

A. Reject the request with **400** when `keys.length > 200`, telling the
   caller to split. Forces the UI to chunk — which is the right design
   given the existing per-batch cap. This is the safer change.

B. Process in chunks internally and return all URLs. More UX-friendly but
   requires deciding whether to keep a server-side hard cap (probably
   yes — too many sign operations per request still wastes server time).

Plan A is the default; the executor may switch to B only with explicit
operator approval (STOP condition below).

## Current state

### Search-index module

`src/lib/search/index-ops.ts` exports:

- `indexUpsert(input)` (lines 37–62) — single row, `prisma.objectIndex.upsert`.
- `indexBulkUpsert(items)` (lines 64–90) — uses
  `prisma.$executeRaw\`INSERT … ON CONFLICT (connectionId, bucket, key) DO UPDATE SET … \``.
  Already the right pattern. ID column is filled with
  `${crypto.randomUUID()}`; `lastModified`/`size`/`etag`/`extension`/`mime`/`lastSeenAt`
  all map cleanly.
- `indexDelete(input)` (lines 92–109) — single row,
  `prisma.objectIndex.deleteMany({ where: { connectionId, bucket, key } })`.
- `indexDeleteBucket`, `indexRename`, `indexUpdateTags`, `indexTagsForKeys` —
  out of scope.
- All operations are guarded by `if (!isSearchIndexEnabled()) return;` at
  the top, and all failures are swallowed via `logFailure` (the existing
  pattern; the helper exists at line 33).

### Mutation call sites (verified at `6dbaee9`)

- `src/app/api/objects/delete/route.ts:9, 62` — imports `indexDelete`,
  calls it once per key in a `Promise.all`.
- `src/app/api/objects/copy/route.ts:13, 151-163` — imports `indexUpsert`,
  calls it once per `successfulResults` entry. All callers map to
  `{ workspaceId: targetAccess.workspaceId, connectionId: targetConnectionId,
  bucket: targetBucket, key: r.targetKey, size: 0n, lastModified: new Date(),
  etag: null }`.
- `src/app/api/objects/move/route.ts:15, 172-187` — imports both.
  Pattern is `Promise.all(successfulResults.flatMap((r) => [indexDelete({…source}), indexUpsert({…target})]))`.
  Same `{ size: 0n, lastModified: new Date(), etag: null }` placeholders
  as copy.
- `src/app/api/objects/rename/route.ts:9, 76` — uses `indexRename` for a
  single key. NOT in scope (already single-call by design).
- `src/app/api/objects/folder/route.ts:8, 59` — single `indexUpsert` for
  a folder marker. NOT in scope (already single-call).

### Presign-batch state

`src/app/api/objects/presign-batch/route.ts` (verified):

- Lines 17–22 validate `keys` is a non-empty string array.
- Line 24: `const cappedKeys = keys.slice(0, 200);`
- Lines 39–48: `await Promise.all(cappedKeys.map(async (key) => { … }))`.
- Lines 50–53: returns `{ urls, errors? }`. The caller cannot tell that
  201–N were silently dropped because the request `keys.length` is not
  echoed back.

Hard ceiling rationale: 200 presign calls is already ~1–3 seconds of
`getSignedUrl` work. The cap exists for a reason; the bug is that excess
keys are silently dropped instead of producing an error.

### Frontend callers

- `src/lib/queries/presign.ts` is the only client-side consumer (verified
  by `grep -rn "presign-batch" src`). It sends `keys` raw.
- The callers ultimately come from `src/components/browser/file-list.tsx`
  (multi-select download flows) and the zip-download / bulk-ops panels.

Confirm the caller list at planning time with:
```bash
grep -rn "presign-batch\|presign\.batch\|usePresignBatch" src --include="*.ts" --include="*.tsx"
```

The plan only requires updating the SERVER route. If client code happily
sends >200 keys today, the 400 response will surface a clear error to
fix the client. That client fix may need a follow-up plan — see
Maintenance notes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Tests | `pnpm test` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Focused grep — index | `grep -rn "indexDelete\\|indexUpsert" src/app/api/objects --include="*.ts"` | one call per route per direction (no Promise.all map) after the fixes |
| Focused grep — presign | `grep -n "cappedKeys" src/app/api/objects/presign-batch/route.ts` | no matches after Step 4 |

Plan 003 lands the clean composite gate; all three checks here expect exit 0.

## Scope

**In scope** (the only files you should modify or create):

- `src/lib/search/index-ops.ts` — add `indexBulkDelete`; export it.
- `src/lib/search/index-ops.test.ts` (create) — unit tests for the new
  helper plus a characterization test for `indexBulkUpsert`.
- `src/app/api/objects/delete/route.ts` — swap the `Promise.all(map(indexDelete))` for one `indexBulkDelete` call.
- `src/app/api/objects/copy/route.ts` — swap the `Promise.all(map(indexUpsert))` for one `indexBulkUpsert` call.
- `src/app/api/objects/move/route.ts` — same swap; one `indexBulkDelete` + one `indexBulkUpsert`, both in one Promise.all.
- `src/app/api/objects/presign-batch/route.ts` — replace the silent slice with a 400.
- `plans/README.md` — status row only.

**Out of scope** (do NOT touch):

- `indexUpsert`, `indexDelete`, `indexRename`, `indexUpdateTags`,
  `indexTagsForKeys` — leave their single-row behavior intact; they have
  other callers.
- `src/app/api/objects/rename/route.ts`, `folder/route.ts` — single-key
  index ops; no batching to do.
- `src/app/api/objects/download-zip/route.ts` — already uses
  `collectZipEntries` cap.
- Client-side chunking of presign-batch — surface the error; client fix
  is a follow-up (see Maintenance notes). If the existing
  `src/lib/queries/presign.ts` happens to chunk already, leave it alone.
- `src/lib/search/feature-flag.ts` — guard at module level; not relevant.
- Anything about decoupling indexing from the request path (background
  queue) — bigger architectural change, defer.

## Git workflow

- Branch: `perf/batch-search-index-and-fix-presign` off `main`.
- Suggested commits (or one if you prefer):
  - `perf(search-index): add indexBulkDelete and replace per-key N+1 in delete route`
  - `perf(search-index): use indexBulkUpsert in copy and move folder loops`
  - `fix(presign-batch): reject requests over 200 keys instead of silently truncating`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `indexBulkDelete`

In `src/lib/search/index-ops.ts`, after `indexDelete` (line 109), add:

```ts
export async function indexBulkDelete(input: {
  connectionId: string;
  bucket: string;
  keys: string[];
}): Promise<void> {
  if (!isSearchIndexEnabled()) return;
  if (input.keys.length === 0) return;
  try {
    await prisma.objectIndex.deleteMany({
      where: {
        connectionId: input.connectionId,
        bucket: input.bucket,
        key: { in: input.keys },
      },
    });
  } catch (err) {
    logFailure(
      "bulkDelete",
      { connectionId: input.connectionId, bucket: input.bucket, count: input.keys.length },
      err
    );
  }
}
```

(No raw SQL needed — Prisma's `deleteMany` with `key: { in: keys }`
already compiles to one `DELETE … WHERE … IN (…)` statement. Confirm by
running with `DEBUG="prisma:query"` if curious; not required.)

Add `indexBulkDelete` to the module's exports (it's a flat module — no
barrel file).

**Verify**:
- `pnpm typecheck` → exit 0.
- `grep -c "export async function indexBulkDelete" src/lib/search/index-ops.ts` → `1`.

### Step 2: Write `index-ops.test.ts`

Create `src/lib/search/index-ops.test.ts`, following the prisma-mock
pattern in `src/lib/db/activity.test.ts` (verified during planning to be
the house pattern). Tests:

1. `indexBulkDelete` short-circuits on `keys.length === 0` (does not call
   prisma).
2. `indexBulkDelete` short-circuits when `isSearchIndexEnabled()` returns
   `false`. Mock the feature-flag module.
3. `indexBulkDelete` calls
   `prisma.objectIndex.deleteMany({ where: { connectionId, bucket, key: { in: keys } } })`
   exactly once on the happy path.
4. `indexBulkDelete` swallows a prisma rejection and logs (the existing
   pattern); assert `prisma.objectIndex.deleteMany` was called and no
   exception propagates.
5. Characterization test for `indexBulkUpsert`: happy path produces
   exactly one `$executeRaw` call (mock the prisma adapter). Locking this
   in protects the existing fast path.

Mock structure (copy from `src/lib/db/activity.test.ts:1-32`):

```ts
import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  default: {
    objectIndex: {
      deleteMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
  },
}));

vi.mock("./feature-flag", () => ({
  isSearchIndexEnabled: vi.fn(() => true),
}));
```

**Verify**: `pnpm test src/lib/search/index-ops.test.ts` → all new tests
pass; total file count rises by 1.

### Step 3: Wire `indexBulkDelete` / `indexBulkUpsert` into the three routes

(a) `src/app/api/objects/delete/route.ts`:
- Line 9 import: `import { indexBulkDelete } from "@/lib/search/index-ops";`
  (replace `indexDelete`).
- Replace line 62
  ```ts
  await Promise.all(keys.map((k) => indexDelete({ connectionId, bucket, key: k })));
  ```
  with
  ```ts
  await indexBulkDelete({ connectionId, bucket, keys });
  ```

(b) `src/app/api/objects/copy/route.ts`:
- Line 13 import: `import { indexBulkUpsert } from "@/lib/search/index-ops";`
  (replace `indexUpsert`).
- Replace lines 151–163 (the whole `Promise.all(successfulResults.map((r) => indexUpsert({…})))`)
  with:
  ```ts
  await indexBulkUpsert(
    successfulResults.map((r) => ({
      workspaceId: targetAccess.workspaceId,
      connectionId: targetConnectionId,
      bucket: targetBucket,
      key: r.targetKey,
      size: 0n,
      lastModified: new Date(),
      etag: null,
    }))
  );
  ```

(c) `src/app/api/objects/move/route.ts`:
- Line 15 import: `import { indexBulkDelete, indexBulkUpsert } from "@/lib/search/index-ops";`.
- Replace lines 172–187 (verified at `6dbaee9` to be the
  `Promise.all(successfulResults.flatMap(...))` block — read live code
  before editing):
  ```ts
  await Promise.all([
    indexBulkDelete({
      connectionId: sourceConnectionId,
      bucket: sourceBucket,
      keys: successfulResults.map((r) => r.sourceKey),
    }),
    indexBulkUpsert(
      successfulResults.map((r) => ({
        workspaceId: targetAccess.workspaceId,
        connectionId: targetConnectionId,
        bucket: targetBucket,
        key: r.targetKey,
        size: 0n,
        lastModified: new Date(),
        etag: null,
      }))
    ),
  ]);
  ```

The trailing `Promise.all([…, …])` keeps the two independent operations
parallel (one DB statement each).

**Verify**:
- `grep -rn "indexDelete\\b\\|indexUpsert\\b" src/app/api/objects --include="*.ts"` → no matches in `delete`, `copy`, `move` routes.
  Lines remain for `rename`, `folder` (single-call) only.
- `grep -rn "indexBulkDelete\\|indexBulkUpsert" src/app/api/objects --include="*.ts"` → exactly 3 hits (one per route).
- `pnpm typecheck && pnpm lint && pnpm test` → all exit 0.

### Step 4: Replace silent presign truncation with explicit error

In `src/app/api/objects/presign-batch/route.ts`:

Replace the body block from line 17 (the existing validation) through
line 24 (the `cappedKeys` slice) with:

```ts
const PRESIGN_MAX_KEYS = 200;

if (!connectionId || !bucket || !Array.isArray(keys) || keys.length === 0) {
  return NextResponse.json(
    { error: "connectionId, bucket, and a non-empty keys array are required" },
    { status: 400 }
  );
}
if (keys.length > PRESIGN_MAX_KEYS) {
  return NextResponse.json(
    {
      error: `presign-batch accepts at most ${PRESIGN_MAX_KEYS} keys per request — split the request and retry.`,
      limit: PRESIGN_MAX_KEYS,
      received: keys.length,
    },
    { status: 400 }
  );
}
```

Replace the subsequent `cappedKeys.map(...)` with `keys.map(...)` (no slice
needed). All other lines in the route stay identical.

The `limit` and `received` fields in the body are advisory for the
client — they let the UI compute its own chunking without re-reading
the server's constant.

**Verify**:
- `grep -c "cappedKeys" src/app/api/objects/presign-batch/route.ts` → `0`.
- `grep -c "PRESIGN_MAX_KEYS" src/app/api/objects/presign-batch/route.ts` → `2` (definition + usage in the 400).
- `pnpm typecheck && pnpm lint && pnpm test` → exit 0.

### Step 5: Verify client-side behavior

Check whether any client code currently sends >200 keys to presign-batch
unintentionally:

```bash
grep -rn "presign-batch" src --include="*.ts" --include="*.tsx"
```

For each caller, trace whether it ever passes a `keys.length > 200`
(e.g. from `src/components/browser/bulk-ops-panel.tsx` over a large
selection). If so, the caller needs to chunk — that's a separate plan,
NOT part of this fix. Note the affected callers in the PR description so
the operator can decide.

Common case: `src/lib/queries/presign.ts` derives keys from a
single-bucket selection set (file-list or bulk-ops). Today's UI caps
selection well below 200 in practice; the 400 will surface naturally
only when a user explicitly bulk-selects more.

**Verify**: at least skim each `presign-batch` caller and confirm it
either (a) chunks already or (b) the typical user path keeps it under
200. If neither holds, the caller is at risk of regressing — write the
follow-up plan recommendation into the PR description.

### Step 6: Composite gate

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Expected: exit 0.

## Test plan

New tests in `src/lib/search/index-ops.test.ts` (Step 2). No new
route-level tests in this plan — those land in plan 007's harness.

The grep gates in Steps 3 and 4 are the wiring proof.

## Done criteria

ALL must hold:

- [ ] `pnpm test` exits 0; new `src/lib/search/index-ops.test.ts` exists and passes.
- [ ] `pnpm typecheck` and `pnpm lint` exit 0.
- [ ] `grep -rn "indexDelete\\b\\|indexUpsert\\b" src/app/api/objects` shows hits only in `rename/route.ts` and `folder/route.ts`.
- [ ] `grep -rn "indexBulkDelete\\|indexBulkUpsert" src/app/api/objects` shows exactly 3 sites (delete, copy, move).
- [ ] `grep -c cappedKeys src/app/api/objects/presign-batch/route.ts` → 0.
- [ ] A request to `POST /api/objects/presign-batch` with `keys.length > 200` returns a 400 with the new error shape (verifiable via the file diff; route is not unit-tested).
- [ ] No `src/**` files outside scope are modified (`git status --short`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- One of the routes' `successfulResults` array shape changed since
  `6dbaee9` (rename, additional fields, structural change). The
  `indexBulkUpsert` payload assumes the existing fields exist — if they
  no longer do, the plan needs a small revision.
- A `presign-batch` caller is identified that legitimately sends
  >200 keys (e.g. the zip-download UI does bulk selection >200). The
  caller needs chunking; either add it to this plan (small) or break
  out a follow-up plan B with operator approval.
- The operator approves "fix B" (server-side chunking) over "fix A"
  (400 the request). Switch the Step 4 implementation; the rest of the
  plan stays the same.
- Adding `indexBulkDelete` causes any other existing test to fail —
  that's a regression in the helper; investigate before continuing.
- `pnpm test` reveals that `indexBulkUpsert`'s existing call sites
  expect a different ID-generation strategy than `crypto.randomUUID()`.

## Maintenance notes

- The change keeps semantics identical: `indexBulkDelete` is a strict
  superset of `Promise.all(map(indexDelete))`. There are no observable
  differences for the API consumer.
- The `size: 0n` / `lastModified: new Date()` placeholders in copy and
  move are inherited from the previous code — those rows will be
  corrected on the next crawl. That's an existing behavior, not a new
  one. Note it: searches against the copy/move targets show
  approximate metadata until the crawler reconciles.
- If the presign-batch follow-up (client chunking) becomes urgent,
  consider raising `PRESIGN_MAX_KEYS` to 500 in the same PR — the cap is
  a server-side throughput knob, and 200 was chosen conservatively.
  Re-measure before doubling.
- Reviewer focus: confirm the `move/route.ts` rewrite still preserves
  the `Promise.all([…, …])` parallelism (one DB call for delete, one
  for upsert, both in flight simultaneously). A single sequential
  `await` per call would be a real regression.
