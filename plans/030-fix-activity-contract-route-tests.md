# Plan 030: Repair the object-route tests that break on the `{ ok }` activity contract

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/app/api/objects/copy/route.test.ts src/app/api/objects/move/route.test.ts src/app/api/objects/rename/route.test.ts src/app/api/objects/delete/route.test.ts src/lib/db/activity.ts`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

`pnpm test` is currently RED on `main`: 5 tests fail across 4 files
(`objects/copy`, `objects/move`, `objects/rename`, `objects/delete` route
tests). This blocks every merge because CI runs the test suite as a gate
(plan 005). The failure is not a real product bug — it is a stale test mock.
Two PRs that were green in isolation broke each other when both merged:
PR #35 changed `recordActivity` / `recordActivityBatch` to return a
`{ ok: true } | { ok: false; reason }` result and made the routes branch on
`activityResult.ok`; PR #33 added these route tests, which mock those
functions as bare `vi.fn()` (returning `undefined`). At runtime
`undefined.ok` throws, the route's `catch` turns it into a 500, and the
happy-path tests that expect 200 fail. Fixing the mocks restores the gate.

## Current state

The production contract (do NOT change this file — it is correct):

- `src/lib/db/activity.ts:21` — `export type ActivityResult = { ok: true } | { ok: false; reason: string };`
  Both `recordActivity` (line 23) and `recordActivityBatch` (line 87) return
  `Promise<ActivityResult>`.

The routes branch on `.ok` (correct — do NOT change):

- `src/app/api/objects/delete/route.ts:44-55`:
  ```ts
  const activityResult = await recordActivityBatch({ ... });
  if (!activityResult.ok) {
    console.error("[activity] delete-route lost audit row", { ... });
  }
  ```
  The same `const activityResult = await recordActivity*(...) ; if (!activityResult.ok)`
  shape exists in `copy/route.ts:122-147`, `move/route.ts:153-177`,
  `rename/route.ts:58-68`.

The stale test mocks (these are what you fix). Each test file mocks the
activity module so the function returns `undefined`:

- `src/app/api/objects/delete/route.test.ts:13-15`:
  ```ts
  vi.mock("@/lib/db/activity", () => ({
    recordActivityBatch: vi.fn(),
  }));
  ```
- `src/app/api/objects/copy/route.test.ts:18-20` — same, `recordActivityBatch: vi.fn()`.
- `src/app/api/objects/move/route.test.ts:18-20` — same, `recordActivityBatch: vi.fn()`.
- `src/app/api/objects/rename/route.test.ts:15-17`:
  ```ts
  vi.mock("@/lib/db/activity", () => ({
    recordActivity: vi.fn(),
  }));
  ```

Why this produces a 500: the route does `await recordActivityBatch(...)` which
resolves to `undefined`, then evaluates `if (!activityResult.ok)` →
`undefined.ok` throws `TypeError` → caught by the route's `try/catch` →
`NextResponse.json({ error }, { status: 500 })`. The test asserts `200`.

Repo convention for these mocks: a mocked dependency that the handler awaits
and then reads a field from must return a **resolved value of the real shape**.
Other mocks in the same files already do this — e.g. `meterOperation` is set in
`beforeEach` with `.mockResolvedValue({ allowed: true })`
(`delete/route.test.ts:38`) precisely because the route reads `meter.allowed`.
Follow that same pattern for the activity mock.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run only the 4 affected files | `pnpm test -- src/app/api/objects/copy src/app/api/objects/move src/app/api/objects/rename src/app/api/objects/delete` | all pass |
| Full test suite | `pnpm test` | `Test Files  82 passed (82)`, `Tests  670 passed (670)` |
| Typecheck | `pnpm typecheck` | exit 0, no errors |
| Lint | `pnpm lint` | exit 0 |
| Find any other stale activity mock | `grep -rn "recordActivity\(Batch\|WithBatch\)\?: vi.fn()" src/` | only matches you have fixed (see Step 5) |

## Scope

**In scope** (the only files you should modify):
- `src/app/api/objects/delete/route.test.ts`
- `src/app/api/objects/copy/route.test.ts`
- `src/app/api/objects/move/route.test.ts`
- `src/app/api/objects/rename/route.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/db/activity.ts` — the `{ ok }` contract is correct and intentional
  (PR #35). Do not "simplify" it back to `void`.
- Any `src/app/api/objects/*/route.ts` source file — the routes are correct.
  The bug is entirely in the test mocks. If you find yourself editing a
  `route.ts`, STOP (see STOP conditions).
- Other route test files that already pass.

## Git workflow

- This repo's main checkout is shared by concurrent sessions — run
  `git branch --show-current` before committing.
- Branch: `fix/030-activity-contract-route-tests`.
- One commit: `test: mock recordActivity result shape in object-route tests`
  (matches the repo's conventional-commit style, e.g. `fix: webhook idempotency...`
  in recent `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the failure reproduces

Run `pnpm test -- src/app/api/objects/delete`. You must see the delete
happy-path test (`200 when role is EDITOR; S3 delete is issued`) fail with
`expected 500 to be 200`. If it already passes, the codebase has drifted —
STOP and report.

### Step 2: Fix the three `recordActivityBatch` mocks

In each of `delete/route.test.ts`, `copy/route.test.ts`, and
`move/route.test.ts`, change the activity mock so the function resolves the
real result shape. Change:

```ts
vi.mock("@/lib/db/activity", () => ({
  recordActivityBatch: vi.fn(),
}));
```

to:

```ts
vi.mock("@/lib/db/activity", () => ({
  recordActivityBatch: vi.fn().mockResolvedValue({ ok: true }),
}));
```

Leave every other line in these files unchanged.

**Verify**: `pnpm test -- src/app/api/objects/delete src/app/api/objects/copy src/app/api/objects/move`
→ all pass (delete 5/5, copy 7/7, move 7/7).

### Step 3: Fix the `recordActivity` mock in the rename test

In `rename/route.test.ts` change:

```ts
vi.mock("@/lib/db/activity", () => ({
  recordActivity: vi.fn(),
}));
```

to:

```ts
vi.mock("@/lib/db/activity", () => ({
  recordActivity: vi.fn().mockResolvedValue({ ok: true }),
}));
```

**Verify**: `pnpm test -- src/app/api/objects/rename` → all 7 pass.

### Step 4: Run the full gate

**Verify**:
- `pnpm test` → `Test Files  82 passed (82)`, `Tests  670 passed (670)`.
- `pnpm typecheck` → exit 0.
- `pnpm lint` → exit 0.

### Step 5: Confirm no other stale activity mock remains

Run `grep -rn "recordActivity\(Batch\|WithBatch\)\?: vi.fn()" src/`.

Every match must be one you edited in Steps 2–3 and must now read
`vi.fn().mockResolvedValue({ ok: true })`. If the grep surfaces a *different*
test file mocking `recordActivity*` as a bare `vi.fn()` (i.e. one not in the
Scope list) AND that file's suite fails under `pnpm test`, apply the same
one-line fix there and note it in your report. If it surfaces a different file
but the suite is green, leave it (it may not exercise the `.ok` path) and note
it. Do not expand scope to non-test files.

## Test plan

No new tests. This plan repairs existing tests so they exercise the real
`{ ok }` contract. The verification is the full suite returning
`670 passed (670)` in Step 4. The specific regression guarded is: the four
object-mutation route happy paths return 200 when activity recording succeeds.

## Done criteria

ALL must hold:

- [ ] `pnpm test` exits 0 with `670 passed (670)` (no failures, no skips added)
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `grep -rn "recordActivity\(Batch\|WithBatch\)\?: vi.fn()" src/` shows only
      `.mockResolvedValue({ ok: true })` forms (no bare `vi.fn()`)
- [ ] `git status --short` lists only the 4 in-scope test files (+ `plans/README.md`)
- [ ] No `src/**/route.ts` source file is modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The delete happy-path test does NOT fail at Step 1 (codebase drifted; the bug
  may already be fixed or the contract changed).
- `src/lib/db/activity.ts` no longer exports `ActivityResult` / no longer
  returns `{ ok }` (the contract was reverted — this plan's premise is gone).
- Fixing the mocks does not make a test pass and you find yourself wanting to
  edit a `route.ts` to make it pass — that means the diagnosis is wrong; stop.
- The full suite still has failures after Step 3 that are unrelated to the
  activity contract (different error messages) — report them; do not fix
  unrelated failures under this plan.

## Maintenance notes

- Root cause was a semantic merge conflict: two independently-green PRs (the
  activity-contract change and the route-test harness) broke each other on
  `main`. When a shared helper's return type changes, grep its test mocks
  (`grep -rn "<fnName>: vi.fn()" src/`) — a bare `vi.fn()` returns `undefined`
  and silently passes any `if (!result.field)` check by throwing inside the
  route's `try/catch`.
- Reviewer should confirm the diff is **test-only** (4 files, one line each) and
  that `activity.ts` is untouched.
- Follow-up considered and deferred: a typed test helper
  (e.g. `mockActivityOk()`) to centralize this mock shape so the next contract
  change is one edit. Not done here — four one-line edits don't justify the
  abstraction yet.
