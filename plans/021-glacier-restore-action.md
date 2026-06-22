# Plan 021: Add a Glacier / Deep Archive "Restore" action

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d19fb78..HEAD -- src/app/api/objects src/components/properties-drawer src/lib/queries/objects.ts src/types`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction (native S3 feature)
- **Planned at**: commit `d19fb78`, 2026-06-22

## Why this matters

The app already *understands* archived objects: `HeadObject` returns the raw
`x-amz-restore` header (`src/app/api/objects/head/route.ts:50`), and the
properties drawer reads it to detect GLACIER / DEEP_ARCHIVE objects and blocks
metadata editing with "Restore this archived object before editing its metadata."
(`src/components/properties-drawer/properties-drawer.tsx:192-203`). But there is
**no way to actually restore** — there is no `RestoreObjectCommand` anywhere in
the codebase (grep `RestoreObjectCommand` → zero matches). The user hits a wall:
the app tells them to restore, then offers no button to do it. This plan adds the
missing action — a `POST /api/objects/restore` route and a "Restore" button in
the archived banner — completing a feature that is already 80% built.

## Current state

- `src/app/api/objects/head/route.ts` (lines 36–51) returns `ObjectProperties`
  including `restore: head.Restore` (the raw header). The restore header looks
  like `ongoing-request="true"` (restore in progress) or
  `ongoing-request="false", expiry-date="..."` (restore complete, temporarily
  available).
- `src/types/s3.ts:58-76` defines `ObjectProperties`, with
  `storageClass: string` and `restore?: string`.
- `src/components/properties-drawer/properties-drawer.tsx` computes archive state
  (lines 192–204):

  ```tsx
  const restored = properties.restore?.includes('ongoing-request="false"') ?? false;
  const archived =
    (properties.storageClass === "GLACIER" ||
     properties.storageClass === "DEEP_ARCHIVE") && !restored;
  const tooLarge = (properties.size ?? 0) > MAX_COPY_SIZE;
  const blockedReason = tooLarge
    ? "Objects larger than 5 GB cannot be edited in place."
    : archived
    ? "Restore this archived object before editing its metadata."
    : null;
  const editable = canWrite && !blockedReason;
  ```

  `blockedReason` is rendered as a banner near the top of the editable section
  (find where `blockedReason` is displayed and add the button adjacent to it).

- **Route pattern to follow** — `src/app/api/objects/tag/route.ts` (the whole
  file) is the canonical small object-mutation route: `withAuth`, parse JSON,
  validate required fields, `getConnectionAccessById(connectionId, user.id)`,
  `canManageFiles(access.role)` check, `createS3Client(access.connection)`, send
  the command, `recordActivity(...)`, return `NextResponse.json`. Match it.

- **Client helper pattern** — `src/lib/queries/objects.ts` defines mutations like
  `useCopyObjects` / `useMoveObjects` (lines 189–231) that wrap a `fetch` and
  invalidate `queryKeys.objects.all`. The properties drawer already uses
  `useUpdateObjectMetadata` (grep it). Add `useRestoreObject` in the same file
  following that shape, invalidating `queryKeys.objects.all` on success.

- `RestoreObjectCommand` (from `@aws-sdk/client-s3`) input shape:

  ```ts
  new RestoreObjectCommand({
    Bucket,
    Key,
    RestoreRequest: {
      Days: 1,                                  // how long the copy stays available
      GlacierJobParameters: { Tier: "Standard" } // Expedited | Standard | Bulk
    },
  })
  ```

  For DEEP_ARCHIVE, `Expedited` is **not** supported — only `Standard` / `Bulk`.
  Restores are asynchronous (minutes to hours); the API call only *initiates* the
  restore. A second `RestoreObjectCommand` while one is in progress returns a 409
  `RestoreAlreadyInProgress` — surface that as an informative message, not a hard
  error.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Install   | `pnpm install`                   | exit 0              |
| Typecheck | `pnpm exec tsc --noEmit`         | no new errors vs. baseline |
| Tests     | `pnpm test`                      | all pass            |
| Lint      | `pnpm lint`                      | no new problems vs. baseline |

> Capture the pre-edit `tsc`/`lint` baseline (see plan 019 "Baseline note")
> before editing.

## Scope

**In scope**:
- `src/app/api/objects/restore/route.ts` (create)
- `src/lib/queries/objects.ts` (edit — add `useRestoreObject`)
- `src/components/properties-drawer/properties-drawer.tsx` (edit — add Restore button + status text)

**Out of scope** (do NOT touch):
- The metadata edit route / `src/lib/s3/metadata.ts` — restore is a separate
  operation; the existing "blocked until restored" logic stays as-is.
- The file-row menu (`file-row.tsx`) — restoring from the properties drawer is
  enough for v1; a row-menu entry can come later.
- Lifecycle / transition rules — that's `plans/002`.
- Any polling/notification system for "restore complete" — out of scope; the
  drawer shows current status from `HeadObject` on open, which is sufficient.

## Git workflow

- Branch: `advisor/021-glacier-restore`
- Conventional commits, e.g. `feat(s3): add Glacier/Deep Archive restore action`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create the restore route

Create `src/app/api/objects/restore/route.ts`, modeled exactly on
`src/app/api/objects/tag/route.ts`:

```ts
import { NextResponse } from "next/server";
import { RestoreObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { canManageFiles } from "@/lib/roles";
import { recordActivity } from "@/lib/db/activity";

interface RestoreRequestBody {
  connectionId: string;
  bucket: string;
  key: string;
  days?: number;          // default 1
  tier?: "Standard" | "Bulk" | "Expedited"; // default "Standard"
}

export const POST = withAuth(async (req, { user }) => {
  try {
    const { connectionId, bucket, key, days, tier }: RestoreRequestBody =
      await req.json();

    if (!connectionId || !bucket || !key) {
      return NextResponse.json(
        { error: "connectionId, bucket, and key are required" },
        { status: 400 }
      );
    }
    if (key.endsWith("/")) {
      return NextResponse.json(
        { error: "Folders cannot be restored" },
        { status: 400 }
      );
    }

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (!canManageFiles(access.role)) {
      return NextResponse.json(
        { error: "You do not have permission to restore objects for this connection" },
        { status: 403 }
      );
    }

    const client = createS3Client(access.connection);
    try {
      await client.send(
        new RestoreObjectCommand({
          Bucket: bucket,
          Key: key,
          RestoreRequest: {
            Days: days && days > 0 ? days : 1,
            GlacierJobParameters: { Tier: tier ?? "Standard" },
          },
        })
      );
    } catch (err) {
      // S3 returns RestoreAlreadyInProgress (409) if a restore is underway.
      const name = (err as { name?: string })?.name ?? "";
      if (name === "RestoreAlreadyInProgress") {
        return NextResponse.json(
          { status: "in-progress", message: "A restore is already in progress for this object." },
          { status: 200 }
        );
      }
      throw err;
    }

    await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "RESTORE",
      bucket,
      key,
    });

    return NextResponse.json({ status: "initiated" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
```

**Before relying on `action: "RESTORE"`**: check the activity action type. Grep
the `recordActivity` signature / the activity action union (e.g.
`src/lib/db/activity.ts` and any `ActivityAction` type). If the action field is a
**typed union** that does not include `"RESTORE"`, either (a) add `"RESTORE"` to
that union in the same edit, or (b) if adding to the union pulls in a Prisma enum
migration (it would require a schema change), **omit the `recordActivity` call**
for now and note it in your report. Do **not** introduce a Prisma migration in
this plan.

**Verify**: `pnpm exec tsc --noEmit` → no new errors. The route file compiles.

### Step 2: Add the `useRestoreObject` client mutation

In `src/lib/queries/objects.ts`, add near `useCopyObjects`/`useMoveObjects`:

```ts
interface RestoreParams {
  connectionId: string;
  bucket: string;
  key: string;
  days?: number;
  tier?: "Standard" | "Bulk" | "Expedited";
}

async function restoreObject(params: RestoreParams): Promise<{ status: string; message?: string }> {
  const response = await fetch("/api/objects/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to restore object");
  }
  return response.json();
}

export function useRestoreObject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: restoreObject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
    },
  });
}
```

**Verify**: `pnpm exec tsc --noEmit` → no new errors.

### Step 3: Surface "Restore" in the properties drawer

In `src/components/properties-drawer/properties-drawer.tsx`:

1. Import `useRestoreObject` from `@/lib/queries/objects` and the existing
   `toast` helper (already used in the file — see `handleSave`).
2. Call the hook: `const restore = useRestoreObject();`.
3. Compute restore progress state alongside the existing `restored`/`archived`
   locals (lines 192–197):

   ```tsx
   const restoreInProgress =
     properties.restore?.includes('ongoing-request="true"') ?? false;
   ```

4. Where `blockedReason` is rendered as a banner (the `archived` case), when
   `archived` is true add a **Restore** button (and reflect in-progress state).
   Reuse the existing `Button` component. Example shape:

   ```tsx
   {archived && (
     <Button
       size="sm"
       variant="outline"
       disabled={!canWrite || restoreInProgress || restore.isPending}
       onClick={async () => {
         try {
           const res = await restore.mutateAsync({ connectionId, bucket, key: objectKey });
           toast({
             title:
               res.status === "in-progress"
                 ? "Restore already in progress"
                 : "Restore initiated",
             description:
               "Archived objects take minutes to hours to become available. Re-open this panel to check status.",
           });
         } catch (err) {
           toast({
             title: "Couldn't start restore",
             description: err instanceof Error ? err.message : "Unknown error",
             variant: "destructive",
           });
         }
       }}
     >
       {restoreInProgress ? "Restoring…" : "Restore"}
     </Button>
   )}
   ```

   Use the same `connectionId` / `bucket` / `objectKey` identifiers the
   `handleSave` function uses (they're already in scope in this component).

**Verify**:
- `pnpm exec tsc --noEmit` → no new errors.
- `pnpm lint` → no new problems.
- Manual smoke (if a GLACIER/DEEP_ARCHIVE object is available, or by temporarily
  forcing `archived = true`): the banner shows a Restore button; clicking it
  toasts "Restore initiated"; while `ongoing-request="true"` the button reads
  "Restoring…" and is disabled.

## Test plan

- The repo has **no** route-test harness for `src/app/api/objects` (confirm: no
  test files there) and no S3 mock; route-level tests are deferred to `plans/007`.
  Note this in your report.
- If `ActivityAction` (or similar) is a plain TS union you extended in Step 1, no
  test is needed for that one-line addition.
- Verification: `pnpm test` → existing suite still green (no regressions).

## Done criteria

ALL must hold:

- [ ] `src/app/api/objects/restore/route.ts` exists, compiles, and follows the
      `tag/route.ts` auth + permission pattern.
- [ ] `useRestoreObject` exported from `src/lib/queries/objects.ts`.
- [ ] The properties drawer shows a working "Restore" button only for archived
      (GLACIER/DEEP_ARCHIVE, not-yet-restored) objects, disabled while a restore
      is in progress.
- [ ] `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint` add no new findings vs. baseline.
- [ ] No files outside the in-scope list are modified (`git status`) — except a
      typed activity-action union if you extended it (allowed; note it).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Recording the `"RESTORE"` activity action would require a **Prisma schema /
  enum migration** — omit `recordActivity` and report, rather than migrating.
- The properties-drawer archive/`blockedReason` logic no longer matches the
  excerpt (drawer refactored since `d19fb78`).
- `canManageFiles` / `getConnectionAccessById` / `recordActivity` signatures
  differ from how `tag/route.ts` uses them.

## Maintenance notes

- Restore is asynchronous and S3-billed; the UI deliberately does not poll.
  If a "notify me when restore completes" feature is wanted later, it needs a
  background job — out of scope here.
- A future enhancement: let the user choose retrieval `tier` (Bulk is cheaper /
  slower) and `days`. This plan hardcodes `Standard` / `1 day`; expose them via
  the dialog only if users ask.
- DEEP_ARCHIVE rejects `Expedited` — if a tier selector is added, gate
  `Expedited` to GLACIER only.
- Reviewer: confirm folders (`key` ending `/`) are rejected and the permission
  gate (`canManageFiles`) matches the other mutation routes.
