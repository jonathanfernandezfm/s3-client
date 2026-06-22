# Plan 028: Export the activity log to CSV

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d19fb78..HEAD -- src/app/api/activity src/components/info-drawer/activity-tab.tsx src/lib/queries/activity.ts`
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

The app records a rich audit trail (`ActivityEvent`: who did what to which
object, when, byte sizes, batch IDs) and shows it in a drawer, but the data is
**trapped in the UI** — there is no way to get it out for compliance reviews,
incident analysis, or a spreadsheet. A "Export CSV" action that honors the
current filters and the tier's retention window turns the existing audit data
into a deliverable. It reuses the exact same query/where-clause and retention
logic as the feed, so the export can never show data the feed wouldn't.

## Current state

- `src/app/api/activity/route.ts` — the feed endpoint. It builds its query with
  shared helpers and clamps to the tier's retention window:
  ```ts
  const tier = user.subscription?.tier ?? "FREE";
  const limits = getTierLimits(tier);
  const retentionCutoff = getActivityRetentionCutoff(limits.activityRetentionDays);
  const where = buildWhereClause({ connectionId, bucket, prefix, key, userId, actions, cursor, sinceDate: retentionCutoff });
  const rows = await prisma.activityEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 });
  ```
  It serializes each event to: `id, userId, userDisplayName, userImageUrl,
  action, bucket, key, targetKey, byteSize (string|null), batchId, createdAt
  (ISO)`. The export must use the **same `where`/retention** logic.
- `src/app/api/activity/query-helpers.ts` — exports `buildWhereClause`,
  `getActivityRetentionCutoff`, `parseLimit`, `escapeLike`, `encodeCursor`,
  `decodeCursor`. `buildWhereClause({ connectionId, bucket, prefix, key, userId, actions, sinceDate })`
  is the reusable filter (omit `cursor` for a full export). `ActivityAction` is
  the prisma enum type imported from `@/generated/prisma/client`.
- `src/components/info-drawer/activity-tab.tsx` — the drawer UI. It owns the
  active filters via the info-drawer store and computes a `scope` object
  (lines 250–257):
  ```tsx
  const scope = {
    connectionId: storeScope?.connectionId ?? "",
    bucket: storeScope?.bucket ?? "",
    prefix: storeScope?.prefix,
    key: storeScope?.objectKey,
    userId: userFilter ?? undefined,
    actions: actionFilter !== null && actionFilter.length > 0 ? actionFilter : undefined,
  };
  ```
  The `<FilterStrip …>` (rendered at lines 281–287) is the natural home for an
  "Export CSV" button. `hasScope` (line 248) is `true` only when a bucket is
  open.
- `src/lib/queries/activity.ts` — `ActivityScope` type and the `fetchActivity`
  URL-param builder (lines 38–55) show how scope maps to query params:
  `connectionId, bucket, prefix, key, userId, actions` (actions joined with `,`).
- **Conventions:**
  - Pure helper + colocated `*.test.ts` (exemplar:
    `src/lib/buckets/stats-helpers.ts` + `.test.ts`).
  - `withAuth(async (req, { user }) => …)` for routes; access check via
    `getConnectionAccessById(connectionId, user.id)`.
  - There is no existing CSV code in the repo (`grep -rn "text/csv" src/`
    returns nothing) — you are introducing the first CSV helper.

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|------------------------------------------|---------------------|
| Tests     | `pnpm test`                              | all pass            |
| One file  | `pnpm test -- src/lib/activity/csv.test.ts` | new tests pass   |
| Typecheck | `pnpm exec tsc --noEmit`                 | no **new** errors   |
| Lint      | `pnpm lint`                              | no **new** problems |

**Baseline note (pre-plan-003):** capture baselines first
(`pnpm exec tsc --noEmit 2>&1 | tee /tmp/tsc-before.txt`,
`pnpm lint 2>&1 | tee /tmp/lint-before.txt`); gate = no new errors/problems.
The 2 pre-existing `landing-page.test.tsx` tsc errors are out of scope.

## Scope

**In scope** (create or modify):
- `src/lib/activity/csv.ts` (create) — pure CSV builder + field escaper
- `src/lib/activity/csv.test.ts` (create)
- `src/app/api/activity/export/route.ts` (create) — streams the CSV
- `src/components/info-drawer/activity-tab.tsx` (edit) — add the Export button

**Out of scope** (do NOT touch):
- `src/app/api/activity/route.ts` (the feed) — read it for the pattern, do not
  change it.
- `src/app/api/activity/query-helpers.ts` — reuse its exports; do not edit.
  (If you find you must add a param to `buildWhereClause`, STOP — you should
  not need to; pass `cursor: null`.)
- Retention/tier logic — reuse `getActivityRetentionCutoff` + `getTierLimits`
  exactly; do not let the export bypass the FREE-tier retention window.

## Git workflow

- Branch: `advisor/028-activity-log-csv-export`
- Commit style: conventional commits (e.g.
  `feat(activity): add CSV export of the activity log`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Pure CSV helper + test

Create `src/lib/activity/csv.ts`:

```ts
export interface ActivityCsvRow {
  createdAt: string;        // ISO
  action: string;
  userDisplayName: string;
  userId: string | null;
  bucket: string;
  key: string | null;
  targetKey: string | null;
  byteSize: string | null;  // already stringified BigInt or null
  batchId: string | null;
}

const HEADERS = [
  "createdAt", "action", "userDisplayName", "userId",
  "bucket", "key", "targetKey", "byteSize", "batchId",
] as const;

/** RFC-4180-style field escaping: wrap in quotes if it contains "," <"> CR or LF; double internal quotes. */
export function escapeCsvField(value: string | null | undefined): string {
  const s = value ?? "";
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toActivityCsv(rows: ActivityCsvRow[]): string {
  const lines = [HEADERS.join(",")];
  for (const r of rows) {
    lines.push([
      r.createdAt, r.action, r.userDisplayName, r.userId,
      r.bucket, r.key, r.targetKey, r.byteSize, r.batchId,
    ].map(escapeCsvField).join(","));
  }
  // Trailing newline so the file ends cleanly.
  return lines.join("\r\n") + "\r\n";
}
```

Create `src/lib/activity/csv.test.ts` (model on
`src/lib/buckets/stats-helpers.test.ts`). Cover:
- `escapeCsvField`: plain value unchanged; value with comma gets quoted; value
  with `"` gets doubled-and-quoted; value with newline gets quoted; `null`/
  `undefined` → empty string.
- `toActivityCsv`: empty rows → just the header line + CRLF; one row produces
  header + one data line with fields in declared order; a `key` containing a
  comma (e.g. `"reports/q1,final.pdf"`) is correctly quoted; `null` fields
  render as empty cells.

**Verify**: `pnpm test -- src/lib/activity/csv.test.ts` → all pass.

### Step 2: Export route

Create `src/app/api/activity/export/route.ts`. Model the **auth + filter** half
on `src/app/api/activity/route.ts`, but instead of cursor pagination, loop to
collect all matching rows up to a hard cap, then return CSV:

```ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getConnectionAccessById } from "@/lib/db/connections";
import prisma from "@/lib/db/prisma";
import { buildWhereClause, getActivityRetentionCutoff } from "../query-helpers";
import { getTierLimits } from "@/lib/subscriptions";
import { toActivityCsv } from "@/lib/activity/csv";

const MAX_EXPORT_ROWS = 50_000;
const PAGE = 1_000;

export const GET = withAuth(async (req: NextRequest, { user }) => {
  const { searchParams } = req.nextUrl;
  const connectionId = searchParams.get("connectionId");
  const bucket = searchParams.get("bucket");
  if (!connectionId || !bucket) {
    return NextResponse.json({ error: "connectionId and bucket are required" }, { status: 400 });
  }
  const access = await getConnectionAccessById(connectionId, user.id);
  if (!access) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  const prefix = searchParams.get("prefix") || null;
  const key = searchParams.get("key") || null;
  const userId = searchParams.get("userId") || null;
  const actionsParam = searchParams.get("actions");
  const actions = actionsParam ? actionsParam.split(",").filter(Boolean) : null;

  const tier = user.subscription?.tier ?? "FREE";
  const retentionCutoff = getActivityRetentionCutoff(getTierLimits(tier).activityRetentionDays);
  const where = buildWhereClause({ connectionId, bucket, prefix, key, userId, actions, sinceDate: retentionCutoff });

  const rows: { /* ActivityCsvRow */ }[] = [];
  let cursor: { createdAt: Date; id: string } | undefined;
  let truncated = false;
  for (;;) {
    const pageWhere = cursor
      ? { ...where, OR: [ { createdAt: { equals: cursor.createdAt }, id: { lt: cursor.id } }, { createdAt: { lt: cursor.createdAt } } ] }
      : where;
    const page = await prisma.activityEvent.findMany({
      where: pageWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: PAGE,
    });
    for (const e of page) {
      rows.push({
        createdAt: e.createdAt.toISOString(), action: e.action,
        userDisplayName: e.userDisplayName, userId: e.userId,
        bucket: e.bucket, key: e.key, targetKey: e.targetKey,
        byteSize: e.byteSize !== null ? e.byteSize.toString() : null, batchId: e.batchId,
      });
      if (rows.length >= MAX_EXPORT_ROWS) { truncated = true; break; }
    }
    if (truncated || page.length < PAGE) break;
    const last = page[page.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
  }

  const csv = toActivityCsv(rows);
  const filename = `activity-${bucket}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Export-Truncated": truncated ? "true" : "false",
    },
  });
});
```

Note: the inline cursor `OR` clause replicates `buildWhereClause`'s own cursor
logic (query-helpers.ts:70–76) so you don't have to call it with a cursor —
**do not** modify `buildWhereClause`. If `where` already has its own `OR` (it
won't here, since we never pass `cursor`), spreading would clobber it; we never
pass a cursor into `buildWhereClause`, so `where.OR` is always undefined and the
spread is safe.

**Verify**: `pnpm exec tsc --noEmit` → no new errors. Fill in the `rows` array
element type by reusing `ActivityCsvRow` from the csv helper
(`import type { ActivityCsvRow } from "@/lib/activity/csv"`).

### Step 3: Export button in the activity drawer

In `src/components/info-drawer/activity-tab.tsx`, add an "Export CSV" button to
the `FilterStrip` (it already receives `events`; add the scope-derived params it
needs, or read them where `scope` is built and pass a small `onExport`). Cleanest:
add a `Download` icon button at the top of `FilterStrip`'s returned markup
(`src/components/info-drawer/activity-tab.tsx:204`) that builds the export URL
from the same params as `fetchActivity` and downloads via fetch→blob:

```tsx
async function downloadActivityCsv(scope: {
  connectionId: string; bucket: string; prefix?: string; key?: string;
  userId?: string; actions?: string[];
}) {
  const params = new URLSearchParams({ connectionId: scope.connectionId, bucket: scope.bucket });
  if (scope.prefix) params.set("prefix", scope.prefix);
  if (scope.key) params.set("key", scope.key);
  if (scope.userId) params.set("userId", scope.userId);
  if (scope.actions?.length) params.set("actions", scope.actions.join(","));
  const res = await fetch(`/api/activity/export?${params.toString()}`);
  if (!res.ok) { notify("error", "Export failed", "Couldn't export activity."); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "activity.csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  if (res.headers.get("X-Export-Truncated") === "true") {
    notify("info", "Export truncated", "Only the most recent 50,000 events were exported.");
  }
}
```

Use the `notify` toast helper from `@/lib/stores/notification-store` (same one
`upload-zone.tsx:13` imports). Wire the button so it is disabled / hidden when
`!hasScope`. Build the `scope` object passed to `downloadActivityCsv` from the
same values the component already computes for `scope` (lines 250–257) —
including the *active* `userFilter`/`actionFilter` so the export matches what
the user sees. Put the button next to the "User" label row or above the Actions
chips; match the existing compact styling (`text-xs`, `h-7`).

**Verify**: `pnpm exec tsc --noEmit` → no new errors; `pnpm lint` → no new
problems vs baseline.

## Test plan

- `src/lib/activity/csv.test.ts` — escaping + row assembly (Step 1 cases). This
  is the logic that must be exactly right (CSV injection of commas/quotes is the
  classic bug); it carries the test weight.
- No test for the route or button (no live DB/render harness for these). The
  route reuses the feed's proven where-clause + retention; correctness is
  enforced by review against `activity/route.ts` and typecheck.
- Verification: `pnpm test` → all pass including new CSV tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test` exits 0; `csv.test.ts` exists and passes
- [ ] `pnpm exec tsc --noEmit` → no errors beyond the 2 pre-existing
      `landing-page.test.tsx` ones
- [ ] `pnpm lint` → no new problems vs baseline
- [ ] `test -f src/app/api/activity/export/route.ts`
- [ ] `grep -rn "buildWhereClause" src/app/api/activity/export/route.ts` → the
      export reuses the shared where-clause (not a hand-rolled filter)
- [ ] `git status` shows only the 4 in-scope files
- [ ] `plans/README.md` status row for 028 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `buildWhereClause` / `getActivityRetentionCutoff` / `getTierLimits` signatures
  differ from the excerpts (query-helpers or subscriptions module drifted).
- The feed route's serialization fields differ from what the CSV columns assume.
- You find you must edit `query-helpers.ts` or the feed route to make the export
  work — you should not; report instead.
- A verification fails twice after a reasonable fix.

## Maintenance notes

- The export is capped at **50,000 rows** and sets `X-Export-Truncated` so the
  client can warn — it never silently drops data. If buckets routinely exceed
  this, switch to a streaming `ReadableStream` response that yields CSV chunks
  per DB page instead of buffering all rows in memory; note that in the PR.
- Retention parity is load-bearing: the export must use the *same*
  `getActivityRetentionCutoff` as the feed so a FREE-tier user can't export
  beyond their window. A reviewer should verify the `sinceDate` is wired.
- Deferred: an explicit date-range picker in the UI (the export currently uses
  the same implicit window as the feed). Add a `from`/`to` query param + picker
  later if requested — the route's where-clause can take a `sinceDate`/`untilDate`
  with a small `buildWhereClause` extension at that point.
