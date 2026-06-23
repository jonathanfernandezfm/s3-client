# Plan 045: Memoize the gallery `FileTile` and pass stable callbacks, matching the already-memoized list `FileRow`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/components/browser/file-tile.tsx src/components/browser/file-gallery.tsx src/components/browser/file-row.tsx src/components/browser/file-list.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (`file-row.tsx`/`file-list.tsx` are
> read-only references here — used to copy the proven pattern — but check them
> for drift too, since the pattern you're copying may have moved.)

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (complementary to plan 044; can land in either order)
- **Category**: perf
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

The list view's row component (`FileRow`) is wrapped in `React.memo` and
receives **stable** callback props, so the list only re-renders the rows whose
data actually changed (plan 008). The gallery view's tile component (`FileTile`)
has the opposite shape: it is **not** memoized, and `FileGallery` passes a fresh
inline closure per tile per render (`onSelect={(mods) => handleSelect(object.key, mods)}`,
`onPreview={() => onPreview(object)}`, etc.). The result: every time
`FileGallery` re-renders for *any* reason (drag state changes in the Zustand
store, a dialog opening, typing in the name filter, a tag toggle), **all** tiles
re-render. The gallery is also un-virtualized, so this is every tile in the
folder. This plan brings the gallery to the same memoization parity the list
already has: `FileTile` becomes a `React.memo` component with the same callback
contract as `FileRow`, and `FileGallery` passes the stable `handleSelect` and
parent callbacks directly instead of per-item closures.

**Scope honesty**: like `FileRow`, this does not eliminate re-renders caused by
*selection changes themselves* (the `selectedItems` `Set` gets a new identity on
each selection, which both components receive). It eliminates re-renders caused
by *unrelated* parent re-renders — which are frequent. That is exactly the win
`FileRow` already provides; this brings `FileTile` to the same baseline.

## Current state

### The proven pattern to copy — `FileRow` / `FileList` (DO NOT MODIFY)

`src/components/browser/file-row.tsx`:
- Prop contract (lines 62–65):
  ```ts
  onSelect: (key: string, mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onDelete: (key: string) => void;
  onPreview: (object: S3Object) => void;
  onDownload: (key: string) => void;
  ```
- Internal call sites pass the row's own object/key (lines 205, 216, 235, 307,
  321, 410): `onSelect(object.key, {...})`, `onPreview(object)`,
  `onDownload(object.key)`, `onDelete(object.key)`.
- The component function is named `FileRowImpl` and exported memoized
  (line 455): `export const FileRow = React.memo(FileRowImpl);`
- Import line 3: `import React, { useState } from "react";`

`src/components/browser/file-list.tsx` passes **stable** callbacks to `FileRow`
(lines 257–260): `onSelect={handleSelect}` (from
`usePaneSelection(paneId, orderedKeys)`, line 89–90), and
`onPreview={onPreview}` / `onDelete={onDelete}` / `onDownload={onDownload}`
(the parent's own props) — **no per-item closures**.

### The code to change — `FileTile` / `FileGallery`

`src/components/browser/file-tile.tsx`:
- Import line 3 (no `React` default import yet):
  ```ts
  import { useState } from "react";
  ```
- Prop contract (lines 48–51) — the mismatched shapes:
  ```ts
  onSelect: (mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onPreview: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
  ```
- The component is a plain export (line 69): `export function FileTile({`
- Internal call sites that must change to pass `object.key` / `object`:
  - `onSelect({ shiftKey: ..., ctrlKey: ..., metaKey: ... })` at lines 169, 179, 270, 280
  - `onClick={onPreview}` at lines 287, 326
  - `onClick={onDelete}` at lines 228, 383
  - `onClick={onDownload}` at line 337

`src/components/browser/file-gallery.tsx`:
- `handleSelect` comes from `usePaneSelection(paneId, orderedKeys)` (lines 96–97)
  and is a stable reference (same hook `FileList` uses).
- Three `.map` blocks render `FileTile` (folders ~line 184, images ~line 208,
  others ~line 237). Each currently passes per-item closures:
  ```tsx
  onSelect={(mods) => handleSelect(object.key, mods)}
  onPreview={() => onPreview(object)}
  onDelete={() => onDelete(object.key)}
  onDownload={() => onDownload(object.key)}   // images + others blocks only
  ```
  `onNavigate`, `onDragStart`, `onDragEnd`, `onTagClick`, `onFolderDrop`
  (`handleFolderDrop`) are already passed as references.

### Repo conventions

- Memoized components in this repo follow the `XImpl` + `export const X = React.memo(XImpl)`
  pattern (`file-row.tsx:455`). Match it exactly.
- `React.memo` (default-import `React`), not the named `memo` import — to match
  `file-row.tsx`.

## Commands you will need

| Purpose   | Command                                            | Expected on success |
|-----------|----------------------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                                    | exit 0, no errors   |
| Lint      | `pnpm lint`                                         | exit 0              |
| Tests     | `pnpm test`                                         | all pass            |
| Consumers | `grep -rn "FileTile" src/`                          | only `file-gallery.tsx` + `file-tile.tsx` |

## Suggested executor toolkit

- If available, invoke the `vercel-react-best-practices` skill when wiring up
  the `React.memo` wrapper and verifying callback stability.

## Scope

**In scope** (the only files you should modify):
- `src/components/browser/file-tile.tsx`
- `src/components/browser/file-gallery.tsx`

**Out of scope** (do NOT touch — read-only references):
- `src/components/browser/file-row.tsx`, `src/components/browser/file-list.tsx`
  — these are the *pattern source*; copying from them is the whole point, but
  they are already correct.
- `src/components/browser/use-file-item-behavior.ts`,
  `use-pane-selection.ts` — the drag/selection hooks are shared and correct.
- `file-browser.tsx` — covered by plan 044.

## Git workflow

- Branch: `advisor/045-memoize-gallery-filetile`
- Commit message style: conventional commits, e.g.
  `perf: memoize gallery FileTile and pass stable callbacks`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Confirm FileTile has exactly one consumer

Run `grep -rn "FileTile" src/`. Expected: definitions/imports only in
`src/components/browser/file-tile.tsx` and `src/components/browser/file-gallery.tsx`.
If any **other** file renders `<FileTile .../>`, STOP and report — that consumer
would also need its closures updated and is not covered here.

**Verify**: grep output lists only those two files.

### Step 1: Change `FileTile`'s callback prop contract to match `FileRow`

In `src/components/browser/file-tile.tsx`, update the `FileTileProps` interface
(lines 48–51) to:

```ts
  onSelect: (key: string, mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onPreview: (object: S3Object) => void;
  onDelete?: (key: string) => void;
  onDownload?: (key: string) => void;
```

(`S3Object` is already imported at the top of the file.)

**Verify**: typecheck will now report errors at the internal call sites — that's
expected; fix them in Step 2.

### Step 2: Update `FileTile`'s internal call sites to pass its own object/key

In the same file:

- The four `onSelect({ shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey })`
  calls (lines 169, 179, 270, 280) become:
  ```ts
  onSelect(object.key, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
  ```
- `onClick={onPreview}` (lines 287, 326) becomes `onClick={() => onPreview(object)}`.
- `onClick={onDelete}` (lines 228, 383) becomes `onClick={() => onDelete?.(object.key)}`.
- `onClick={onDownload}` (line 337) becomes `onClick={() => onDownload?.(object.key)}`.

Use `?.` for `onDelete`/`onDownload` because they remain optional props.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Wrap `FileTile` in `React.memo`

In `src/components/browser/file-tile.tsx`:

1. Change the import on line 3 to default-import React:
   ```ts
   import React, { useState } from "react";
   ```
2. Rename the component declaration (line 69) from
   `export function FileTile({` to `function FileTileImpl({`.
3. At the very end of the file, add:
   ```ts
   export const FileTile = React.memo(FileTileImpl);
   ```

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 4: Pass stable callbacks from `FileGallery`

In `src/components/browser/file-gallery.tsx`, in **all three** `.map` blocks
(folders, images, others), replace the per-item closures with direct references:

- `onSelect={(mods) => handleSelect(object.key, mods)}` → `onSelect={handleSelect}`
- `onPreview={() => onPreview(object)}` → `onPreview={onPreview}`
- `onDelete={() => onDelete(object.key)}` → `onDelete={onDelete}`
- `onDownload={() => onDownload(object.key)}` → `onDownload={onDownload}`
  (present only in the images and others blocks)

Leave all other props as they are (`object`, `connectionId`, `bucket`,
`currentPath`, `canWrite`, `isSelected`, `onNavigate`, `thumbnailUrl`, `paneId`,
`allObjects`, `selectedItems`, `onDragStart`, `onDragEnd`, `onFolderDrop`,
`isDragging`, `canDropOnFolder`, `noteCount`, `shareCount`, `tags`, `activeTag`,
`onTagClick`).

**Verify**: `pnpm typecheck` → exit 0 (the gallery's `onPreview`/`onDelete`/
`onDownload`/`handleSelect` already have the matching `(object)`/`(key)`/
`(key, mods)` signatures, so direct passing typechecks).

### Step 5: Full gate + manual smoke

**Verify**:
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0
- `pnpm test` → all pass
- Manual smoke (if a browser is available): switch to gallery view, then
  - click a tile's checkbox / shift-click / ctrl-click → selection behaves as before;
  - click a tile (image) → preview opens;
  - use a tile's "Download" and "Delete" menu items → correct file is acted on;
  - drag a tile and drop on a folder tile → copy/move still works.
  Confirm no console errors.

## Test plan

- There is no render-perf test harness in this repo, and this is a behavior-
  preserving refactor, so no new unit tests are added. The risk is **behavioral
  regression in selection/preview/delete/download/DnD**, which the manual smoke
  in Step 5 covers.
- The existing suite must remain green: `pnpm test` → all pass.
- Reference pattern for the memoization shape: `file-row.tsx` + `file-list.tsx`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0
- [ ] `grep -n "export const FileTile = React.memo" src/components/browser/file-tile.tsx` → 1 match
- [ ] `grep -n "(mods) => handleSelect" src/components/browser/file-gallery.tsx` → no matches (closures removed)
- [ ] `grep -rn "FileTile" src/` shows only `file-tile.tsx` and `file-gallery.tsx`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- `FileTile` has a consumer other than `FileGallery` (Step 0).
- `handleSelect` from `usePaneSelection` does NOT have the signature
  `(key: string, mods: {...}) => void` (i.e. passing it directly to `onSelect`
  fails to typecheck) — report the mismatch instead of re-wrapping it in a closure.
- The manual smoke shows selection/preview/delete/download/DnD behaving
  differently than before — revert and report (this is the MED-risk surface).
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- **Known remaining cost (deferred, matches `FileRow`)**: tiles still re-render
  on selection changes because `selectedItems` (a `Set`) and `tags`
  (`fileTags[key] ?? []` allocates a fresh `[]` for untagged items) get new
  identities. Fully fixing this would mean passing `isSelected` only (already
  done) and a stable empty-array constant, plus splitting `selectedItems` out of
  the props the tile reads. Not in scope — the list has the same behavior; doing
  one without the other would create an inconsistency.
- **Gallery is un-virtualized.** Even with memoization, very large folders render
  all tiles on mount. If gallery perf is still a complaint after this, the next
  step is virtualizing the gallery grid (mirror the `@tanstack/react-virtual`
  setup in `file-list.tsx`) — a separate, larger plan.
- Reviewer should scrutinize: the four internal call-site edits in `file-tile.tsx`
  (a missed `object.key` would act on the wrong file), and that the gallery's
  three `.map` blocks were all updated consistently.
- If plan 034 (keyboard nav) or 033 (context menu) land and touch `file-tile.tsx`
  / `file-gallery.tsx`, re-run this plan's drift check before starting.
