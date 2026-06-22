# Plan 022: Add "Copy to… / Move to…" destination picker to the bulk-ops toolbar

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d19fb78..HEAD -- src/components/browser/bulk-ops-panel.tsx src/lib/queries/objects.ts src/lib/queries/connections.ts src/lib/queries/buckets.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction (UX)
- **Planned at**: commit `d19fb78`, 2026-06-22

## Why this matters

Copy and move are fully implemented server-side (`POST /api/objects/copy`,
`POST /api/objects/move`) and exposed client-side as `useCopyObjects` /
`useMoveObjects` (`src/lib/queries/objects.ts:189-231`). But the **only** way a
user can trigger them is **drag-and-drop** onto a folder. The bulk-ops toolbar —
which already hosts Download, Rename, Tag, Share, Delete — has no Copy or Move.
That makes the two most fundamental file operations the hardest to reach: moving
20 selected objects to another bucket means a precise drag gesture, often across
panes/tabs, with no way to target a folder that isn't currently visible, and no
way to target a different *connection* at all from the UI. Adding "Copy to… /
Move to…" buttons backed by a small destination picker closes the gap and reuses
all the existing plumbing.

## Current state

- `src/components/browser/bulk-ops-panel.tsx` — the floating toolbar shown when
  ≥2 items are selected. It receives props (lines 34–41):

  ```tsx
  interface BulkOpsPanelProps {
    paneId: string;
    connectionId: string;
    bucket: string;
    currentPath: string;
    objects: S3Object[];
    canWrite: boolean;
  }
  ```

  It derives `selection` (lines 117) = `objects.filter((o) => selectedItems.has(o.key))`
  and renders ghost `<Button>`s inside the `showIdle` toolbar (lines 247–313),
  e.g. Download (`downloadSelectionAsZip`), Rename, Tag, Share, Delete. Each
  write action is gated behind `canWrite` and (for some) a `CapabilityGate`.
  Several actions clear the selection on success via `clearSelection(paneId)`.

- The copy/move client hooks already exist (`src/lib/queries/objects.ts`):

  ```ts
  // CopyMoveParams = { sourceConnectionId, sourceBucket, sourceKeys,
  //                    targetConnectionId, targetBucket, targetPath }
  export function useCopyObjects() { /* mutation → /api/objects/copy */ }
  export function useMoveObjects() { /* mutation → /api/objects/move */ }
  ```

  Both return `{ results, summary: { total, successful, failed } }` and already
  invalidate `queryKeys.objects.all` + activity + notes on success.

- The copy/move routes resolve the **target file name** from each source key's
  basename and place it under `targetPath` (`copy/route.ts:184-186`:
  `targetKey = targetPath ? \`${targetPath}${fileName}\` : fileName`). So
  `targetPath` must be either `""` (bucket root) or a prefix ending in `/`
  (e.g. `archive/2024/`). The picker must produce a value in that form.

- **Connection & bucket list hooks**: confirm the exact exported names before
  use. Grep `src/lib/queries/connections.ts` for a `useConnections` hook
  (returns the user's connections; secret keys are stripped) and
  `src/lib/queries/buckets.ts` for a `useBuckets(connectionId)` hook (returns the
  buckets for a connection). The CLAUDE.md and `keys.ts` confirm both query
  families exist. Use whatever the actual exported hook names are.

- **Dialog + toast conventions**: reuse `@/components/ui/dialog`
  (`Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter`)
  — already imported in `bulk-ops-panel.tsx` (lines 17–24). Use the same `toast`
  / notification approach the panel already uses (`addNotification` from
  `useNotificationStore`, see `downloadSelectionAsZip`).

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
- `src/components/browser/destination-picker-dialog.tsx` (create)
- `src/components/browser/bulk-ops-panel.tsx` (edit — add two buttons + wiring)

**Out of scope** (do NOT touch):
- `src/app/api/objects/copy/route.ts`, `move/route.ts` — already implemented;
  no server change needed. (If you believe a server change is required, STOP.)
- `src/lib/queries/objects.ts` — `useCopyObjects`/`useMoveObjects` are used as-is;
  do not modify them.
- The drag-and-drop move/copy path (`file-item-behavior.ts`, `drag-preview.tsx`) —
  leave it; this plan *adds* a menu path alongside it.
- A full folder-tree browser in the picker — v1 is connection + bucket dropdowns
  + a path text field. A visual folder browser is a deferred enhancement (see
  Maintenance notes).

## Git workflow

- Branch: `advisor/022-bulk-copy-move-menu`
- Conventional commits, e.g. `feat(browser): add bulk Copy to / Move to actions`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Build the destination picker dialog

Create `src/components/browser/destination-picker-dialog.tsx`. It is a controlled
dialog that collects a destination (`connectionId`, `bucket`, `path`) and calls
back. Shape:

```tsx
"use client";

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// import the actual hooks (confirm names): useConnections, useBuckets

export interface Destination {
  connectionId: string;
  bucket: string;
  path: string; // "" for root, or a prefix ending in "/"
}

interface DestinationPickerDialogProps {
  open: boolean;
  mode: "copy" | "move";
  count: number;
  /** sensible defaults: the current connection/bucket the user is in */
  defaultConnectionId: string;
  defaultBucket: string;
  onCancel: () => void;
  onConfirm: (dest: Destination) => void;
}

export function DestinationPickerDialog({
  open, mode, count, defaultConnectionId, defaultBucket, onCancel, onConfirm,
}: DestinationPickerDialogProps) {
  const [connectionId, setConnectionId] = useState(defaultConnectionId);
  const [bucket, setBucket] = useState(defaultBucket);
  const [path, setPath] = useState("");

  const connections = useConnections();         // confirm hook name/return shape
  const buckets = useBuckets(connectionId);      // confirm hook name/return shape

  // When the connection changes, reset bucket to the first available.
  useEffect(() => {
    if (connectionId !== defaultConnectionId) setBucket("");
  }, [connectionId, defaultConnectionId]);

  const normalizedPath =
    path.trim() === "" ? "" : path.trim().replace(/^\/+/, "").replace(/\/*$/, "/");
  const canConfirm = !!connectionId && !!bucket;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "copy" ? "Copy" : "Move"} {count} item{count !== 1 ? "s" : ""}</DialogTitle>
          <DialogDescription>
            Choose a destination connection, bucket, and folder. Leave the folder
            blank to place items at the bucket root.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <Label className="flex flex-col gap-1">
            Connection
            <select
              className="h-9 rounded-md border bg-background px-2"
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
            >
              {/* map connections → <option value={c.id}>{c.name}</option> */}
            </select>
          </Label>

          <Label className="flex flex-col gap-1">
            Bucket
            <select
              className="h-9 rounded-md border bg-background px-2"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
            >
              <option value="">Select a bucket…</option>
              {/* map buckets → <option value={b.name}>{b.name}</option> */}
            </select>
          </Label>

          <Label className="flex flex-col gap-1">
            Folder (optional)
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="e.g. archive/2024/"
            />
          </Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            disabled={!canConfirm}
            onClick={() => onConfirm({ connectionId, bucket, path: normalizedPath })}
          >
            {mode === "copy" ? "Copy here" : "Move here"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Adapt the `select` option-mapping and hook calls to the **actual** return shapes
of `useConnections` / `useBuckets` (field names like `id`/`name` for connections,
`name`/`Name` for buckets — read the hooks to confirm). If `useBuckets` requires
a non-empty connectionId or has a loading state, render a disabled placeholder
option while loading.

**Verify**: `pnpm exec tsc --noEmit` → no new errors; the file compiles.

### Step 2: Wire two buttons into the bulk-ops toolbar

In `src/components/browser/bulk-ops-panel.tsx`:

1. Imports: `useCopyObjects, useMoveObjects` from `@/lib/queries/objects`;
   `DestinationPickerDialog, type Destination` from `./destination-picker-dialog`;
   icons `Copy` and `FolderInput` (or `MoveRight`) from `lucide-react` (add to the
   existing import).
2. Hooks + local state near the other hooks:

   ```tsx
   const copyObjects = useCopyObjects();
   const moveObjects = useMoveObjects();
   const [transferMode, setTransferMode] = useState<"copy" | "move" | null>(null);
   ```

3. A handler that runs the chosen transfer against `selection`:

   ```tsx
   async function handleTransfer(dest: Destination) {
     const mode = transferMode;
     setTransferMode(null);
     if (!mode) return;
     const sourceKeys = selection.map((o) => o.key);
     if (sourceKeys.length === 0) return;
     const notifId = addNotification({
       type: mode === "move" ? "info" : "info",
       title: `${mode === "copy" ? "Copying" : "Moving"} ${sourceKeys.length} item${sourceKeys.length !== 1 ? "s" : ""}…`,
       status: "in-progress",
     });
     try {
       const mutation = mode === "copy" ? copyObjects : moveObjects;
       const res = await mutation.mutateAsync({
         sourceConnectionId: connectionId,
         sourceBucket: bucket,
         sourceKeys,
         targetConnectionId: dest.connectionId,
         targetBucket: dest.bucket,
         targetPath: dest.path,
       });
       const failed = res.summary.failed;
       updateNotification(notifId, {
         status: failed === 0 ? "completed" : "error",
         title:
           failed === 0
             ? `${mode === "copy" ? "Copied" : "Moved"} ${res.summary.successful} item${res.summary.successful !== 1 ? "s" : ""}`
             : `${mode === "copy" ? "Copy" : "Move"} finished with ${failed} error${failed !== 1 ? "s" : ""}`,
       });
       if (failed === 0) clearSelection(paneId);
     } catch (err) {
       updateNotification(notifId, {
         status: "error",
         title: `${mode === "copy" ? "Copy" : "Move"} failed`,
         description: err instanceof Error ? err.message : "Unknown error",
       });
     }
   }
   ```

   (Match the exact `addNotification`/`updateNotification` field names the panel
   already uses — see `runLoop` and `downloadSelectionAsZip` in this file.)

4. Add the two buttons inside the `showIdle` toolbar, next to Rename/Tag, gated by
   `canWrite` (copy/move both write to a target):

   ```tsx
   {canWrite && (
     <Button size="sm" variant="ghost" onClick={() => setTransferMode("copy")}>
       <Copy className="h-4 w-4" />
       Copy to…
     </Button>
   )}
   {canWrite && (
     <Button size="sm" variant="ghost" onClick={() => setTransferMode("move")}>
       <FolderInput className="h-4 w-4" />
       Move to…
     </Button>
   )}
   ```

5. Render the dialog near the other dialogs at the end of the component's JSX:

   ```tsx
   {transferMode && (
     <DestinationPickerDialog
       open={transferMode !== null}
       mode={transferMode}
       count={selection.length}
       defaultConnectionId={connectionId}
       defaultBucket={bucket}
       onCancel={() => setTransferMode(null)}
       onConfirm={handleTransfer}
     />
   )}
   ```

   **Important**: the `if (!showIdle && !showProgress && !dialogOpen) return null;`
   early-return (line 241) must not hide the picker. Because the picker is driven
   by `transferMode` (local state) and opens from the `showIdle` toolbar (which is
   visible while selecting), this is fine — but confirm the dialog still renders
   while open. If the early return would unmount it, include `transferMode !== null`
   in that guard condition.

**Verify**:
- `pnpm exec tsc --noEmit` → no new errors.
- `pnpm lint` → no new problems.
- Manual smoke (dev server): select ≥2 items → "Copy to…" and "Move to…" appear →
  clicking opens the picker → choosing a bucket + confirming triggers a transfer
  and a notification; on success the selection clears and the list refreshes.

## Test plan

- The bulk-ops area has no existing component tests and the transfer logic is a
  thin wrapper over already-shipped, separately-exercised mutations
  (`useCopyObjects`/`useMoveObjects`). No new automated test is required.
- If you extract the `normalizedPath` logic into a tiny pure function, add a unit
  test for it (root → `""`, `"a/b"` → `"a/b/"`, `"/a/"` → `"a/"`); otherwise the
  inline form is acceptable.
- Verification: `pnpm test` → existing suite still green.

## Done criteria

ALL must hold:

- [ ] `src/components/browser/destination-picker-dialog.tsx` exists and compiles.
- [ ] "Copy to…" and "Move to…" appear in the bulk-ops toolbar when ≥2 items are
      selected and `canWrite` is true.
- [ ] Confirming the picker calls `useCopyObjects`/`useMoveObjects` with the
      selected `sourceKeys` and the chosen `targetConnectionId/targetBucket/targetPath`,
      shows a progress/result notification, and clears the selection on full success.
- [ ] `targetPath` sent to the API is `""` or a prefix ending in `/` (verify with
      the normalize logic).
- [ ] `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint` add no new findings vs. baseline.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- `useConnections` / `useBuckets` do not exist or do not expose connection
  `id`/`name` and bucket names to the client — report what the actual hooks
  provide before improvising a new query.
- `useCopyObjects`/`useMoveObjects` or `CopyMoveParams` no longer match the
  "Current state" excerpt.
- The bulk-ops panel's early-return or notification API differs from the
  excerpts (panel refactored since `d19fb78`).
- You conclude a server change is needed — it should not be; the routes already
  support cross-connection copy/move.

## Maintenance notes

- **Cross-endpoint fidelity**: when both source and target connections differ in
  endpoint, the move/copy goes through the streaming path that (until `plans/020`
  lands) drops metadata/tags. If 020 is not yet merged, note in the PR that
  cross-endpoint transfers via this UI inherit that limitation.
- **Deferred enhancement**: replace the bucket dropdown + path text field with a
  live folder browser (lazy-listing prefixes via the existing objects list query)
  so users can click into the destination instead of typing the prefix.
- **Same-location guard**: copying/moving into the exact source prefix is a no-op
  or self-overwrite; consider warning when `dest` equals the current
  connection+bucket+path. Low priority (S3 self-copy is harmless) — noted, not
  required.
- Reviewer: confirm `Move to…` is gated by `canWrite` on the *source* (move
  deletes from source) and that the destination picker's chosen connection is one
  the user actually has write access to — the server re-checks
  (`move/route.ts:77`), so the UI gate is convenience, not security.
