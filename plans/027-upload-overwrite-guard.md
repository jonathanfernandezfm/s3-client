# Plan 027: Warn on upload key conflicts instead of silently overwriting

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d19fb78..HEAD -- src/components/browser/upload-zone.tsx src/lib/uploads/controller.ts src/app/api/objects/head/route.ts`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `d19fb78`, 2026-06-22

## Why this matters

Uploads silently overwrite any existing object with the same key. The upload
path (`enqueueUploads` → `PutObject`/multipart) has **no existence check** —
drop a `logo.png` into a folder that already has one and the old object is
destroyed with no warning. For a storage-management tool this is surprise data
loss. This plan adds a pre-upload conflict check that, when keys already exist,
prompts the user to **Replace**, **Skip existing**, or **Keep both** (upload
under a non-colliding name). When nothing collides, behavior is unchanged (no
extra prompt, no perceptible delay).

## Current state

- `src/components/browser/upload-zone.tsx` — owns the upload entry points. A
  single shared hook builds the enqueue callback used by drag-drop, the
  "Upload file" button, and the "Upload folder" button (lines 22–51):
  ```tsx
  function useEnqueueFiles(connectionId, bucket, currentPath) {
    const queryClient = useQueryClient();
    return useCallback(
      (files: FileWithPath[]) => {
        if (files.length === 0) {
          notify("info", "Nothing to upload", "No files were found in the selection.");
          return;
        }
        enqueueUploads(
          files.map(({ file, relativePath }) => ({
            file, connectionId, bucket,
            key: currentPath + relativePath,
            onComplete: () => queryClient.invalidateQueries({
              queryKey: [...queryKeys.objects.all, connectionId, bucket],
            }),
          }))
        );
      },
      [connectionId, bucket, currentPath, queryClient]
    );
  }
  ```
  This hook is the single choke point — all three upload triggers route through
  it. That is where the conflict check belongs.
- `src/lib/uploads/controller.ts` — `enqueueUploads(inputs: EnqueueInput[])`
  (lines 59–99) is the queue API. `EnqueueInput = { file, connectionId, bucket, key, onComplete? }`.
  **Do not change its signature** — you only change *which* inputs you pass it.
- `src/app/api/objects/head/route.ts` — existing `withAuth` route that does a
  single `HeadObjectCommand`. Use it as the structural model for the new
  existence route (same imports: `createS3Client`, `getConnectionAccessById`,
  `withAuth`). A 404/`NotFound` from `HeadObject` means "does not exist".
- `notify(type, title, description)` from `@/lib/stores/notification-store`
  (imported at `upload-zone.tsx:13`) is the toast helper.
- **Conventions:**
  - API routes: `withAuth(async (req, { user }) => …)`, parse JSON body, look
    up access via `getConnectionAccessById(connectionId, user.id)` (404 if
    null), build client via `createS3Client(access.connection)`. See
    `src/app/api/objects/head/route.ts` verbatim.
  - Pure helpers live under `src/lib/**` with a colocated `*.test.ts`
    (exemplar: `src/lib/rename-key.ts` + `src/lib/rename-key.test.ts`).
  - Zustand stores live under `src/lib/stores/` (exemplar:
    `src/lib/stores/upload-store.ts`). A single global dialog reads store state.

## Commands you will need

| Purpose   | Command                                       | Expected on success |
|-----------|-----------------------------------------------|---------------------|
| Tests     | `pnpm test`                                   | all pass            |
| One file  | `pnpm test -- src/lib/uploads/conflict-name.test.ts` | new tests pass |
| Typecheck | `pnpm exec tsc --noEmit`                      | no **new** errors   |
| Lint      | `pnpm lint`                                   | no **new** problems |

**Baseline note (pre-plan-003):** capture the dirty baseline first —
`pnpm exec tsc --noEmit 2>&1 | tee /tmp/tsc-before.txt`,
`pnpm lint 2>&1 | tee /tmp/lint-before.txt`. Gate = **no new** errors/problems
vs those files. The 2 pre-existing `landing-page.test.tsx` tsc errors are out
of scope (plan 003 owns them).

## Scope

**In scope** (modify or create):
- `src/app/api/objects/exists/route.ts` (create) — batch existence check
- `src/lib/uploads/conflict-name.ts` (create) — pure "keep both" key renamer
- `src/lib/uploads/conflict-name.test.ts` (create)
- `src/lib/stores/upload-conflict-store.ts` (create) — pending-conflict state
- `src/components/browser/upload-conflict-dialog.tsx` (create) — the prompt
- `src/components/browser/upload-zone.tsx` (edit) — call the check before enqueue
- `src/components/browser/file-browser.tsx` (edit) — mount the dialog once

**Out of scope** (do NOT touch):
- `src/lib/uploads/controller.ts`, `uploader.ts`, `transport.ts`, `api.ts` —
  the queue/transport layer. The conflict resolution happens *before* enqueue;
  do not thread conflict logic into the uploader.
- The multipart routes under `src/app/api/objects/multipart/**`.
- Same-key *server* behavior — S3 PutObject still overwrites; "Replace" relies
  on exactly that. Do not add server-side overwrite protection.

## Git workflow

- Branch: `advisor/027-upload-overwrite-guard`
- Commit style: conventional commits (e.g.
  `feat(uploads): prompt on key conflicts before overwriting`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Batch existence-check API route

Create `src/app/api/objects/exists/route.ts`, modeled on
`src/app/api/objects/head/route.ts`. Contract:

- Body: `{ connectionId: string; bucket: string; keys: string[] }`.
- Validate all three present and `keys` is a non-empty array; else 400.
- Resolve access with `getConnectionAccessById`; 404 if null.
- For each key, send a `HeadObjectCommand`. Treat a thrown error whose
  `name`/`Code` is `NotFound`/`NoSuchKey`/HTTP 404 as **does not exist**; any
  *other* error should fail the whole request with 500 (do not silently treat
  an auth/network error as "does not exist" — that would re-introduce the
  overwrite risk).
- Run the heads with **bounded concurrency** (at most 8 in flight). A simple
  pattern: process the `keys` array in chunks of 8 with `Promise.all` per chunk.
- Cap input at 1000 keys; if `keys.length > 1000` return 400 with a clear
  message (the client guards against this — see Step 4 — so this is defensive).
- Response: `{ existing: string[] }` — the subset of `keys` that already exist.

**Verify**: `pnpm exec tsc --noEmit` → no new errors. (No live S3 here, so the
route is verified by typecheck + review, not execution.)

### Step 2: Pure "keep both" renamer + test

Create `src/lib/uploads/conflict-name.ts`:

```ts
/** Split a key into [dir, base, ext] where ext includes the leading dot (or ""). */
function splitKey(key: string): { dir: string; base: string; ext: string } {
  const slash = key.lastIndexOf("/");
  const dir = slash === -1 ? "" : key.slice(0, slash + 1);
  const name = slash === -1 ? key : key.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  // Treat a leading-dot name (".env") as having no extension.
  if (dot <= 0) return { dir, base: name, ext: "" };
  return { dir, base: name.slice(0, dot), ext: name.slice(dot) };
}

/**
 * Given a desired key and the set of keys already taken (existing on S3 *and*
 * already chosen in this batch), return the first non-colliding variant:
 * "a/photo.png" -> "a/photo (1).png" -> "a/photo (2).png" … If `key` itself is
 * free, it is returned unchanged.
 */
export function nextAvailableKey(key: string, taken: Set<string>): string {
  if (!taken.has(key)) return key;
  const { dir, base, ext } = splitKey(key);
  for (let n = 1; ; n++) {
    const candidate = `${dir}${base} (${n})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}
```

Create `src/lib/uploads/conflict-name.test.ts` (model on
`src/lib/rename-key.test.ts`). Cover:
- key not in `taken` → returned unchanged.
- single collision → ` (1)` inserted before the extension
  (`"a/photo.png"` taken → `"a/photo (1).png"`).
- multiple collisions → skips to the first free index (taken =
  `{a/photo.png, a/photo (1).png}` → `"a/photo (2).png"`).
- no-extension key (`"a/README"`) → `"a/README (1)"`.
- dotfile (`"a/.env"`) → `"a/.env (1)"` (the leading dot is not an extension).
- top-level key (no `/`) → `"photo (1).png"`.

**Verify**: `pnpm test -- src/lib/uploads/conflict-name.test.ts` → all pass.

### Step 3: Conflict store + dialog

Create `src/lib/stores/upload-conflict-store.ts` — a zustand store holding one
pending conflict and a resolver promise:

```ts
import { create } from "zustand";

export type ConflictChoice = "replace" | "skip" | "keep-both" | "cancel";

interface PendingConflict {
  total: number;
  conflictCount: number;
  conflictNames: string[]; // display names, for the dialog body (cap to ~10)
}

interface UploadConflictState {
  pending: PendingConflict | null;
  _resolve: ((choice: ConflictChoice) => void) | null;
  ask: (c: PendingConflict) => Promise<ConflictChoice>;
  resolve: (choice: ConflictChoice) => void;
}

export const useUploadConflictStore = create<UploadConflictState>((set, get) => ({
  pending: null,
  _resolve: null,
  ask: (c) =>
    new Promise<ConflictChoice>((resolve) => set({ pending: c, _resolve: resolve })),
  resolve: (choice) => {
    get()._resolve?.(choice);
    set({ pending: null, _resolve: null });
  },
}));
```

(Confirm `zustand`'s `create` import matches the other stores — open
`src/lib/stores/upload-store.ts` and copy its exact import line.)

Create `src/components/browser/upload-conflict-dialog.tsx` — a single global
dialog reading the store, modeled on `src/components/browser/rename-dialog.tsx`
for the `Dialog`/`DialogContent`/`DialogFooter` structure:

- When `pending` is null, render nothing.
- Title: "Some files already exist".
- Body: "`{conflictCount}` of `{total}` file(s) already exist in this folder:"
  then a short list of `conflictNames` (cap at 10, "+N more" if longer).
- Footer buttons, each calling `resolve(...)`:
  - "Cancel" (`variant="outline"`) → `resolve("cancel")`
  - "Skip existing" → `resolve("skip")`
  - "Keep both" → `resolve("keep-both")`
  - "Replace" (`variant="destructive"` if available, else default) → `resolve("replace")`
- `onOpenChange(false)` (Esc / backdrop) → `resolve("cancel")`.

**Verify**: `pnpm exec tsc --noEmit` → no new errors.

### Step 4: Gate `useEnqueueFiles` on the conflict check

In `src/components/browser/upload-zone.tsx`, make the enqueue callback async and
insert the check between the empty-guard and `enqueueUploads`. Target shape:

```tsx
import { nextAvailableKey } from "@/lib/uploads/conflict-name";
import { useUploadConflictStore } from "@/lib/stores/upload-conflict-store";
import { objectDisplayName } from "@/lib/browser/name-filter"; // if 026 landed; else inline a basename()

const MAX_CONFLICT_CHECK = 1000;

// inside useEnqueueFiles, replacing the body of the returned callback:
async (files: FileWithPath[]) => {
  if (files.length === 0) {
    notify("info", "Nothing to upload", "No files were found in the selection.");
    return;
  }
  const targets = files.map(({ file, relativePath }) => ({
    file, key: currentPath + relativePath,
  }));

  // Too many to check cheaply → preserve old behavior, but tell the user.
  if (targets.length > MAX_CONFLICT_CHECK) {
    notify("info", "Uploading", `Existing files may be overwritten (${targets.length} files, conflict check skipped).`);
    enqueue(targets.map((t) => t.key), targets);
    return;
  }

  let existing: string[] = [];
  try {
    const res = await fetch("/api/objects/exists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, bucket, keys: targets.map((t) => t.key) }),
    });
    if (res.ok) existing = (await res.json()).existing ?? [];
    // On a failed check, fall through with existing = [] but warn:
    else notify("info", "Uploading", "Couldn't check for existing files; they may be overwritten.");
  } catch {
    notify("info", "Uploading", "Couldn't check for existing files; they may be overwritten.");
  }

  const existingSet = new Set(existing);
  if (existingSet.size === 0) {
    enqueue(targets.map((t) => t.key), targets);
    return;
  }

  const choice = await useUploadConflictStore.getState().ask({
    total: targets.length,
    conflictCount: existingSet.size,
    conflictNames: existing.map((k) => objectDisplayName(k)),
  });

  if (choice === "cancel") return;

  if (choice === "skip") {
    const kept = targets.filter((t) => !existingSet.has(t.key));
    if (kept.length === 0) { notify("info", "Nothing to upload", "All selected files were skipped."); return; }
    enqueue(kept.map((t) => t.key), kept);
    return;
  }

  if (choice === "replace") {
    enqueue(targets.map((t) => t.key), targets);
    return;
  }

  // keep-both: rename only the colliding ones; reserve names as we go.
  const taken = new Set(existingSet);
  const renamedKeys = targets.map((t) => {
    const k = nextAvailableKey(t.key, taken);
    taken.add(k);
    return k;
  });
  enqueue(renamedKeys, targets);
}
```

Where `enqueue(keys, targets)` is a small local helper that calls the existing
`enqueueUploads` with the per-file `onComplete` invalidation already in the
current code:

```tsx
const enqueue = (keys: string[], targets: { file: File }[]) =>
  enqueueUploads(
    targets.map((t, i) => ({
      file: t.file, connectionId, bucket, key: keys[i],
      onComplete: () => queryClient.invalidateQueries({
        queryKey: [...queryKeys.objects.all, connectionId, bucket],
      }),
    }))
  );
```

Note the callback is now `async`; the three call sites
(`handleDrop`'s `.then(enqueueFiles)`, and the two `onChange` handlers) already
fire-and-forget the result, so no call-site change is needed — but verify each
still compiles (a `Promise<void>` return is fine for those handlers). If
`objectDisplayName` from plan 026 is not present (026 not landed), inline a tiny
local `basename(key)` instead of importing it.

**Verify**: `pnpm exec tsc --noEmit` → no new errors.

### Step 5: Mount the dialog once

In `src/components/browser/file-browser.tsx`, import and render
`<UploadConflictDialog />` once, near where `<FilePreviewModal …>` and
`<DeleteConfirmDialog …>` are rendered (around lines 696–709). It takes no
props (reads the store). Mounting it inside the browser pane is sufficient
because every upload trigger lives inside that pane.

**Verify**: `pnpm exec tsc --noEmit` → no new errors; `pnpm lint` → no new
problems vs baseline.

## Test plan

- `src/lib/uploads/conflict-name.test.ts` — the renamer (Step 2 cases). This is
  the logic most likely to be wrong, so it carries the test weight.
- No new test for the route or React wiring (the repo does not test API routes
  against a live S3 or render the browser pane). The route's correctness is
  enforced by review against the `objects/head` exemplar and typecheck.
- Verification: `pnpm test` → all pass including new renamer tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test` exits 0; `conflict-name.test.ts` exists and passes
- [ ] `pnpm exec tsc --noEmit` → no errors beyond the 2 pre-existing
      `landing-page.test.tsx` ones in `/tmp/tsc-before.txt`
- [ ] `pnpm lint` → no new problems vs `/tmp/lint-before.txt`
- [ ] `test -f src/app/api/objects/exists/route.ts` (route created)
- [ ] `grep -n "UploadConflictDialog" src/components/browser/file-browser.tsx`
      returns the mount
- [ ] `git status` shows only the 7 in-scope files
- [ ] `plans/README.md` status row for 027 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `useEnqueueFiles` in `upload-zone.tsx` no longer matches the excerpt, or
  `enqueueUploads`/`EnqueueInput` signature has changed.
- You cannot determine from `HeadObject` error shape how to distinguish "not
  found" (404) from a real error — report rather than guessing, because
  treating a real error as "not found" re-enables silent overwrite.
- The zustand `create` import path differs from `src/lib/stores/upload-store.ts`.
- A verification fails twice after a reasonable fix attempt.
- Honoring the conflict flow appears to require changing `controller.ts` or the
  uploader (it should not).

## Maintenance notes

- The check is **per-key HeadObject**. For very large drops it is capped at
  1000 keys (above that the old overwrite behavior applies *with a toast*, not
  silently). If future product wants conflict handling on huge folder uploads,
  replace the per-key heads with a `ListObjectsV2` over the common prefix and a
  client-side set intersection — note that in the PR if you change the cap.
- A reviewer should scrutinize: (1) that a *failed* existence check warns and
  does not silently claim "no conflicts"; (2) the `keep-both` reservation set
  prevents two same-named files in one batch from colliding with each other;
  (3) the dialog resolves `"cancel"` on Esc/backdrop so a closed dialog never
  leaves a dangling promise.
- Deferred: a per-file choice (skip *this* one, replace *that* one). This plan
  ships a single batch-level choice, which covers the common case.
