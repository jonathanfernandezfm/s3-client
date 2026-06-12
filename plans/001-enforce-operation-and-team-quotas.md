# Plan 001: Enforce monthly operation quotas and team size caps per the subscription-tier spec

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a4acb59..HEAD -- src/lib/subscriptions src/app/api/objects src/app/api/teams`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (adds a DB read+write to hot request paths; blocks requests at quota)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `a4acb59` (branch `tags`), 2026-06-12

## Why this matters

The approved tier spec (`docs/superpowers/specs/2026-06-04-subscription-tiers-design.md`)
defines FREE = 1,000 operations/month, PRO = 50,000, and PRO teams capped at
1 team / 5 members. Its enforcement map (lines 119–130) even lists
`canPerformOperation()` as "existing" enforcement — but the function has
**zero callers** anywhere in `src/`. Likewise `recordDownload` and
`recordOperation` are never called, so `UsageRecord.operationCount` only
moves on multipart upload completion, the billing page shows a near-zero
operations meter, and nothing stops a FREE user from unlimited operations.
Team caps are also unenforced: a PRO user can create unlimited teams and add
unlimited members. This plan wires the already-built check/record functions
into the API routes so the billing model actually holds.

## Current state

Relevant files (all paths relative to repo root):

- `src/lib/subscriptions/tiers.ts` — tier table. `TIER_LIMITS` (lines 20–45):
  FREE `monthlyOperations: 1000`, PRO `50000`, ENTERPRISE `-1` (unlimited via
  `isUnlimited()`); `teams: { enabled, maxTeams, maxMembersPerTeam }`
  (PRO: `maxTeams: 1, maxMembersPerTeam: 5`). Do not modify this file.
- `src/lib/subscriptions/check-limits.ts` — `canPerformOperation(userId, tier)`
  (lines 62–90) reads `prisma.usageRecord.findUnique` for the current month and
  returns `LimitCheckResult { allowed, reason?, current?, limit? }`. **No callers.**
  `canCreateConnection` (lines 12–36) is the pattern to copy for new checks.
- `src/lib/subscriptions/usage.ts` — `recordUpload(userId, bytes)` (lines 13–34,
  upserts `uploadBytes` + `operationCount`), `recordDownload` (lines 39–60,
  **no callers**), `recordOperation(userId)` (lines 65–81, upserts
  `operationCount` only, **no callers**), `getMonthlyUsage` (lines 86–100, used
  by the billing page).
- `src/lib/subscriptions/index.ts` — barrel re-exporting all of the above.
- `src/app/api/objects/multipart/create/route.ts` — the only route that checks
  a tier limit today. Lines 56–60:
  ```ts
  const tier = user.subscription?.tier ?? "FREE";
  const sizeCheck = canUploadFileSize(fileSize, tier);
  if (!sizeCheck.allowed) {
    return NextResponse.json({ error: sizeCheck.reason }, { status: 403 });
  }
  ```
- `src/app/api/objects/multipart/complete/route.ts` — imports `recordUpload`
  (line 9) and calls `await recordUpload(user.id, Number(size));` (line 114).
  This is `recordUpload`'s **only** caller.
- Object routes that must be metered (each fetches
  `getConnectionAccessById(connectionId, user.id)` and returns 404/403 before
  doing S3 work — insert metering AFTER those checks, BEFORE the first
  `client.send(...)` / `getSignedUrl(...)`):
  - `src/app/api/objects/route.ts` — list (POST). Access check at lines 29–35;
    note this route has **no** ADMIN-role check (viewers may list).
  - `src/app/api/objects/delete/route.ts` — access at 26, ADMIN check at 33.
  - `src/app/api/objects/copy/route.ts` — dual access checks at 57–58 (source
    and target connections); meter once, after both checks pass.
  - `src/app/api/objects/move/route.ts` — dual access checks at 59–60; same.
  - `src/app/api/objects/rename/route.ts` — access at 40, ADMIN at 44.
  - `src/app/api/objects/folder/route.ts` — access at 24, ADMIN at 31.
  - `src/app/api/objects/tag/route.ts` — meter the **POST** handler only
    (access at 34, ADMIN at 38). The same file has a second handler around
    line 90 (read path) — leave it unmetered.
  - `src/app/api/objects/download/route.ts` — access at 23, no ADMIN check.
  - `src/app/api/objects/presign-batch/route.ts` — access at 26.
  - `src/app/api/objects/download-zip/route.ts` — access at 56.
- Team routes:
  - `src/app/api/teams/route.ts` — POST (lines 65–120) checks
    `canAccessFeature(tier, "teams")` then creates team + workspace + ADMIN
    member in a transaction. **No `maxTeams` check.**
  - `src/app/api/teams/[teamId]/members/route.ts` — POST (lines 9–78) checks
    `isTeamAdmin`, validates `role !== "ADMIN" && role !== "VIEWER"` (line 25),
    rejects duplicates, then `prisma.teamMember.create`. **No
    `maxMembersPerTeam` check.**
- `prisma/schema.prisma` — `Team` has `createdById` (line 150); `TeamMember`
  has `@@unique([teamId, userId])`; `UsageRecord` has
  `@@unique([userId, month])`. No schema changes are needed in this plan.
- Billing display (NO changes needed — it starts showing real numbers once
  metering lands): `src/app/app/settings/billing/page.tsx` calls
  `getMonthlyUsage`; `src/components/billing/billing-tab.tsx` renders the
  Operations meter at line 125–130.

Conventions to match:

- Limit failures return **403** with `{ error: check.reason }` — see
  `src/app/api/connections/route.ts:69-73`. Use 403, not 429.
- Unit tests mock prisma with `vi.mock("@/lib/db/prisma", ...)` before
  importing the module under test — copy the structure of
  `src/lib/db/activity.test.ts` (lines 1–32).
- Spec language (use in error messages and comments): "operations" are counted
  per S3 API call — spec line 32: "list, copy, move, rename, delete, tag,
  folder create. Uploads and downloads also count as operations." Bandwidth is
  informational only, never enforced (spec line 30).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Tests | `pnpm test` | exit 0 — baseline: 53 files / 458 tests, all pass |
| Lint | `pnpm lint` | **dirty baseline**: 27 problems (12 errors, 15 warnings) pre-exist at `a4acb59`. Gate = no NEW problems in files you touch |
| Typecheck | `pnpm exec tsc --noEmit` | **dirty baseline**: 10 errors pre-exist at `a4acb59` (none in in-scope files). Gate = no NEW errors in files you touch |

Capture both dirty baselines verbatim before Step 1 so you can diff against
them at the end.

## Scope

**In scope** (the only files you should modify or create):
- `src/lib/subscriptions/metering.ts` (create)
- `src/lib/subscriptions/metering.test.ts` (create)
- `src/lib/subscriptions/check-limits.ts`
- `src/lib/subscriptions/check-limits.test.ts` (create)
- `src/lib/subscriptions/usage.ts`
- `src/lib/subscriptions/index.ts`
- `src/app/api/objects/route.ts`, `delete/route.ts`, `copy/route.ts`,
  `move/route.ts`, `rename/route.ts`, `folder/route.ts`, `tag/route.ts`,
  `download/route.ts`, `presign-batch/route.ts`, `download-zip/route.ts`,
  `multipart/create/route.ts`, `multipart/complete/route.ts`
- `src/app/api/teams/route.ts`, `src/app/api/teams/[teamId]/members/route.ts`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):
- `src/app/api/objects/versions/**` — version operations are not in the
  spec's operation list; deferred (see Maintenance notes).
- `src/app/api/objects/head/route.ts`, `metadata/route.ts`, `tags/route.ts`,
  `multipart/sign-parts/route.ts` — reads or sub-steps of an already-metered
  upload; metering them would double-count.
- `src/lib/subscriptions/tiers.ts`, `gates.ts` — limits and gates are correct.
- All UI components, including `billing-tab.tsx` (the 80%-warning toast from
  the spec is deferred) and the upload UI.
- `prisma/schema.prisma` — no migration needed.
- Share-link public routes (`src/app/(public)/**`, `src/app/api/share-links/**`)
  — anonymous traffic, not covered by per-user quotas.

## Git workflow

- This repo's main checkout is shared by concurrent sessions — run
  `git branch --show-current` before each commit and make sure you are still
  on your branch.
- Branch: `feat/enforce-tier-quotas` off the current branch's merge target
  (`main`).
- Conventional commits, e.g. `feat(billing): meter object operations against monthly quota`
  (style matches `git log`, e.g. `fix(tags): validate keys array contains only strings...`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `meterOperation` helper

Create `src/lib/subscriptions/metering.ts`:

```ts
import type { SubscriptionTier } from "@/generated/prisma/client";
import { canPerformOperation, type LimitCheckResult } from "./check-limits";
import { recordOperation } from "./usage";

/**
 * Check the monthly operation quota and, when allowed, record one operation.
 * Operations are counted per S3 API call (list, copy, move, rename, delete,
 * tag, folder create, upload, download) per the subscription-tiers spec.
 */
export async function meterOperation(
  userId: string,
  tier: SubscriptionTier
): Promise<LimitCheckResult> {
  const check = await canPerformOperation(userId, tier);
  if (!check.allowed) {
    return check;
  }
  await recordOperation(userId);
  return check;
}
```

Export it from `src/lib/subscriptions/index.ts` (add to the existing barrel).

Write `src/lib/subscriptions/metering.test.ts` (mock prisma like
`src/lib/db/activity.test.ts`; the mocked model is `usageRecord` with
`findUnique` and `upsert`):
- under limit → `allowed: true` and `usageRecord.upsert` called once
- at limit (findUnique returns `{ operationCount: 1000 }`, tier FREE) →
  `allowed: false`, reason mentions the limit, `upsert` NOT called
- ENTERPRISE (unlimited) → `allowed: true`, `upsert` called (usage still
  recorded for the dashboard), `findUnique` NOT called

**Verify**: `pnpm test` → exit 0, 458 + your new tests all pass.

### Step 2: Replace `recordUpload`/`recordDownload` with `recordUploadBytes`

In `src/lib/subscriptions/usage.ts`:
- Add `recordUploadBytes(userId: string, bytes: number)` — same upsert shape
  as the current `recordUpload` but incrementing **only** `uploadBytes`
  (create: `{ userId, month, uploadBytes: BigInt(bytes) }`, update:
  `{ uploadBytes: { increment: BigInt(bytes) } }`). No `operationCount`
  change — the operation is now counted by `meterOperation` at upload-create
  time (Step 3), and double-counting must be avoided.
- Delete `recordUpload` and `recordDownload`. (Verified at planning time:
  `recordUpload`'s only caller is `multipart/complete/route.ts:114`;
  `recordDownload` has none. Re-verify with
  `grep -rn "recordUpload\|recordDownload" src --include=*.ts` first — if you
  find another caller, STOP.)
- Update the exports in `src/lib/subscriptions/index.ts` accordingly
  (`recordUploadBytes`, `recordOperation`, `getMonthlyUsage` stay/appear;
  `recordUpload`, `recordDownload` go).

In `src/app/api/objects/multipart/complete/route.ts`: remove the
`recordUpload` import (line 9) and the call at line 114. Do not add a
replacement here — bytes are now recorded at create time.

**Verify**:
`grep -rn "recordUpload\b\|recordDownload\b" src --include=*.ts --include=*.tsx`
→ no matches outside `usage.ts`'s new `recordUploadBytes` definition.
`pnpm test` → exit 0.

### Step 3: Meter uploads at multipart/create

In `src/app/api/objects/multipart/create/route.ts`, directly after the
existing `sizeCheck` block (lines 56–60), add:

```ts
const meter = await meterOperation(user.id, tier);
if (!meter.allowed) {
  return NextResponse.json({ error: meter.reason }, { status: 403 });
}
await recordUploadBytes(user.id, fileSize);
```

Import both from `@/lib/subscriptions`. This counts every upload (single-PUT
and multipart) exactly once and records its bytes, regardless of whether the
client completes it (accepted trade-off, see Maintenance notes).

**Verify**: `pnpm test` → exit 0. `pnpm exec eslint src/app/api/objects/multipart/create/route.ts` → exit 0.

### Step 4: Meter mutating object routes

In each of `delete`, `copy`, `move`, `rename`, `folder`, `tag` (POST handler
only) under `src/app/api/objects/`, insert the same block immediately after
the last existing access/role check and before any S3 client work:

```ts
const tier = user.subscription?.tier ?? "FREE";
const meter = await meterOperation(user.id, tier);
if (!meter.allowed) {
  return NextResponse.json({ error: meter.reason }, { status: 403 });
}
```

(`user.subscription` is already loaded by `withAuth` —
`src/lib/auth/protect.ts:30-33` includes it.) For `copy` and `move`, place it
after BOTH source and target access checks. Import `meterOperation` from
`@/lib/subscriptions`.

**Verify**:
`grep -ln "meterOperation" src/app/api/objects/delete/route.ts src/app/api/objects/copy/route.ts src/app/api/objects/move/route.ts src/app/api/objects/rename/route.ts src/app/api/objects/folder/route.ts src/app/api/objects/tag/route.ts`
→ all six files listed. `pnpm test` → exit 0.

### Step 5: Meter list and download routes

Insert the same block (Step 4 shape) after the access check in:
- `src/app/api/objects/route.ts` (list — after the 404 check at lines 29–35)
- `src/app/api/objects/download/route.ts`
- `src/app/api/objects/presign-batch/route.ts` (one operation per request,
  not per key)
- `src/app/api/objects/download-zip/route.ts` (one operation per request)

Download bytes are NOT recorded (presigned URLs are fetched client→S3, so
the server never sees the transfer; deferred — see Maintenance notes).

**Verify**: `grep -c "meterOperation" src/app/api/objects/route.ts src/app/api/objects/download/route.ts src/app/api/objects/presign-batch/route.ts src/app/api/objects/download-zip/route.ts` → 1+ per file (import + call). `pnpm test` → exit 0.

### Step 6: Enforce team caps

In `src/lib/subscriptions/check-limits.ts` add two functions following the
`canCreateConnection` pattern:

- `canCreateTeam(userId: string, tier: SubscriptionTier)` — limit =
  `TIER_LIMITS[tier].teams.maxTeams`; if `isUnlimited(limit)` allow; else
  count `prisma.team.count({ where: { createdById: userId } })`; block when
  `count >= limit` with reason like
  `"Your ${tier} plan allows ${limit} team(s). Upgrade to create more."`.
- `canAddTeamMember(teamId: string)` — load
  `prisma.team.findUnique({ where: { id: teamId }, include: { createdBy: { include: { subscription: true } }, _count: { select: { members: true } } } })`;
  return `{ allowed: false, reason: "Team not found" }` if null. The cap comes
  from the **team creator's** tier (`team.createdBy.subscription?.tier ?? "FREE"`):
  limit = `TIER_LIMITS[tier].teams.maxMembersPerTeam`; if `isUnlimited(limit)`
  allow; block when `team._count.members >= limit` with reason like
  `"This team has reached its ${limit}-member limit. The team owner can upgrade for more seats."`.

Export both from `index.ts`. Wire them in:

- `src/app/api/teams/route.ts` POST — after the existing `canAccessFeature`
  check (lines 65–72):
  ```ts
  const teamCheck = await canCreateTeam(user.id, tier);
  if (!teamCheck.allowed) {
    return NextResponse.json({ error: teamCheck.reason }, { status: 403 });
  }
  ```
- `src/app/api/teams/[teamId]/members/route.ts` POST — after the
  `isTeamAdmin` check (lines 11–15):
  ```ts
  const seatCheck = await canAddTeamMember(teamId);
  if (!seatCheck.allowed) {
    return NextResponse.json({ error: seatCheck.reason }, { status: 403 });
  }
  ```

Add tests in `src/lib/subscriptions/check-limits.test.ts` (mock prisma; models
`team` with `count`/`findUnique`, `usageRecord` with `findUnique`):
- `canCreateTeam`: PRO with 0 existing → allowed; PRO with 1 → blocked;
  ENTERPRISE → allowed without counting
- `canAddTeamMember`: PRO creator + 4 members → allowed; + 5 members →
  blocked; ENTERPRISE creator → allowed; creator with no subscription row →
  treated as FREE → blocked; team not found → blocked
- `canPerformOperation`: under / at / unlimited (it had no direct tests)

**Verify**: `pnpm test` → exit 0, all new tests pass.

### Step 7: Final verification

Run the full gate set and compare against the captured baselines.

**Verify**:
- `pnpm test` → exit 0
- `pnpm lint` → problem count ≤ 27 and no NEW messages pointing at in-scope files
- `pnpm exec tsc --noEmit` → error count ≤ 10 and no NEW errors in in-scope files
- `git status --short` → only in-scope files modified/created

## Test plan

All unit tests, mocking prisma per `src/lib/db/activity.test.ts`:

- `src/lib/subscriptions/metering.test.ts` — 3 cases (Step 1).
- `src/lib/subscriptions/check-limits.test.ts` — 9+ cases (Step 6).
- Existing suites must stay green: `pnpm test` → 53 files / 458 tests baseline
  plus the new files.

Route handlers themselves are not unit-tested in this repo (only
`webhooks/stripe/handler.test.ts` exists at the API layer) — do not invent a
route-testing harness; the grep checks in Steps 4–5 are the wiring gate.

## Done criteria

ALL must hold:

- [ ] `pnpm test` exits 0; `metering.test.ts` and `check-limits.test.ts` exist and pass
- [ ] `grep -rln "meterOperation" src/app/api/objects` lists exactly these 11 files: `route.ts`, `delete/route.ts`, `copy/route.ts`, `move/route.ts`, `rename/route.ts`, `folder/route.ts`, `tag/route.ts`, `download/route.ts`, `presign-batch/route.ts`, `download-zip/route.ts`, `multipart/create/route.ts`
- [ ] `grep -rn "recordUpload\b\|recordDownload\b" src --include=*.ts` → no matches (only `recordUploadBytes` remains)
- [ ] `grep -n "canCreateTeam" src/app/api/teams/route.ts` and `grep -n "canAddTeamMember" "src/app/api/teams/[teamId]/members/route.ts"` each match
- [ ] `pnpm lint` and `pnpm exec tsc --noEmit` introduce no new problems vs the captured baselines (27 lint problems / 10 tsc errors at `a4acb59`)
- [ ] `git status --short` shows only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows changes in in-scope files, or any "Current state"
  excerpt no longer matches (especially the multipart create/complete lines —
  upload code churns).
- `grep` finds a caller of `recordUpload`/`recordDownload` other than
  `multipart/complete/route.ts:114` (Step 2's assumption is false).
- `src/app/api/teams/[teamId]/members/route.ts` line 25 no longer reads
  `role !== "ADMIN" && role !== "VIEWER"` — the `feat/editor-team-role` branch
  (adds an EDITOR role and touches these routes) has likely merged; the seat
  check is still wanted but report before wiring it.
- A step's verification fails twice after a reasonable fix attempt.
- `pnpm test` baseline is not 458 passing before you start.

## Maintenance notes

- **List metering is the knob most likely to be revisited.** The spec
  explicitly counts `list` (every folder navigation = 1 operation), which can
  exhaust FREE's 1,000/month through ordinary browsing and adds one DB read +
  one DB write per browse request. If product later exempts reads, remove the
  block from `src/app/api/objects/route.ts` only — the helper stays.
- Upload operations/bytes are recorded at create time, so abandoned uploads
  slightly overcount. If that matters, move `recordUploadBytes` back to the
  complete route (multipart) and accept losing single-PUT byte tracking.
- Download **bytes** are still never recorded (the `Downloaded` meter on the
  billing page stays 0). Recording them needs object-size lookups (HEAD) or a
  trusted client hint — deferred deliberately.
- `src/app/api/objects/versions/**` and `metadata/route.ts` PUT are unmetered
  (not in the spec's operation list). If quotas are tightened, meter them with
  the same one-line pattern.
- The spec's 80%-usage warning toast (enforcement map, spec line 125) is UI
  work, not done here; the 403 reason strings are written so the existing
  error toasts read sensibly at 100%.
- When `feat/editor-team-role` merges, EDITOR members count toward
  `maxMembersPerTeam` automatically (the check counts rows, not roles).
- Reviewer focus: confirm metering sits AFTER auth/role checks in every route
  (a metered-but-unauthorized request must not consume quota), and that
  `meterOperation` is not called twice on any path (`copy`/`move` have dual
  access checks but must meter once).
