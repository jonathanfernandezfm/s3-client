# Plan 034: Arrow-key / Enter / Delete keyboard navigation in the file list

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/components/browser/file-list.tsx src/components/browser/file-row.tsx src/components/browser/use-pane-keyboard.ts`
> If any changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (independent of plan 033, but both touch
  `file-row.tsx`/`file-list.tsx` — see "Maintenance notes" for ordering)
- **Category**: direction (UX / accessibility)
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

The file list (table view) supports the mouse and two shortcuts (Ctrl+A,
Escape) but no row-to-row keyboard navigation. Keyboard-first and
accessibility users cannot move a focus cursor down the list, open a folder/file
with Enter, or delete with the Delete key — the universal file-manager
interaction. This plan adds a focus cursor to the **list view only** (the grid
view's 2-D navigation is a separate, larger effort and is out of scope), wired
through the existing `@tanstack/react-virtual` virtualizer so the focused row is
always scrolled into view and kept mounted.

This is the riskier of the UX improvements because it interacts with
virtualization, the existing selection model, and the memoized `FileRow`. It is
deliberately a separate plan from the low-risk context-menu/empty-state work
(plan 033) so it can be reviewed and reverted independently.

## Current state

`src/components/browser/file-list.tsx`:

- Props include the action callbacks already used by rows:
  `onDelete(key)`, `onPreview(object)`, `onDownload(key)`,
  `onNavigate?(path)`, plus `canWrite` (lines 22-55).
- `objects: S3Object[]` is the ordered, already-filtered list passed by the
  parent.
- Selection + the existing keyboard hook are wired at lines 88-95:
  ```tsx
  const orderedKeys = useMemo(() => objects.map((o) => o.key), [objects]);
  const { handleSelect, selectAllInPane, clearSelectionInPane } =
    usePaneSelection(paneId, orderedKeys);
  usePaneKeyboard({ containerRef, onSelectAll: selectAllInPane, onClearSelection: clearSelectionInPane });
  ```
- The virtualizer (lines 97-102):
  ```tsx
  const rowVirtualizer = useVirtualizer({
    count: objects.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });
  ```
  `useVirtualizer` returns a `scrollToIndex(index, { align })` method — use it to
  keep the focused row visible.
- `containerRef` is the outer focusable `<div tabIndex={0}>` (lines 190-200);
  `scrollRef` is the scroll container (lines 221-225). Only rows in
  `rowVirtualizer.getVirtualItems()` are mounted (lines 233-281); each renders a
  `<FileRow object={objects[virtualRow.index]} ... isSelected={...} ... />`.
- An object is a folder when `object.isFolder` is true; the row's own
  navigation uses `href = /app/browser/${connectionId}/${bucket}/${object.key}`
  and calls `onNavigate(object.key)` for folders (see `file-row.tsx:178-187`).
  For files, the row calls `onPreview(object)` when previewable.

`src/components/browser/use-pane-keyboard.ts` — the SHARED hook. It guards
against firing while focus is in an `<input>/<textarea>/contentEditable` (lines
19-25) and only acts when focus is inside `containerRef` (lines 27-30). It
currently handles Ctrl/Cmd+A and Escape. **Do not change this hook** — it is
shared (also used by the grid view). Add list-specific navigation in a new hook
instead.

`src/components/browser/file-row.tsx` — `FileRow` is `React.memo(FileRowImpl)`
(line 455). It takes `isSelected: boolean` and renders the row root `<TableRow>`
with `className={cn("group", isSelected && "bg-muted", ...)}`. Adding a focus
ring means adding one boolean prop and one conditional class.

Conventions: hooks live in `src/components/browser/use-*.ts` and are
`"use client"`. Tailwind classes for state styling (`bg-muted`, `ring-2
ring-blue-500 ring-inset` are already used in this folder). Keep `FileRow`'s
memo effective — add at most one new primitive prop.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | all pass (≥ 670) |
| Dev (manual smoke) | `pnpm dev` | app serves; see Step 5 |

## Suggested executor toolkit

- If available, invoke `vercel-react-best-practices` when writing the new hook
  (stable callback identities, effect dependencies) and `web-design-guidelines`
  for focus-visibility/aria semantics.

## Scope

**In scope** (modify or create):
- `src/components/browser/use-list-keyboard-nav.ts` (create) — the new hook.
- `src/components/browser/file-list.tsx` — focus-index state, wire the hook,
  pass `isFocused` to rows, scroll focused row into view.
- `src/components/browser/file-row.tsx` — accept `isFocused?: boolean`, render a
  focus ring.

**Out of scope** (do NOT touch):
- `src/components/browser/use-pane-keyboard.ts` — shared; leave Ctrl+A/Escape as
  is. Your new hook is additive and list-only.
- `src/components/browser/file-gallery.tsx` — the grid view. 2-D arrow
  navigation is a separate effort; do not add keyboard nav here.
- `usePaneSelection` and the selection store — reuse `handleSelect`; do not
  refactor selection.
- Any API route or data layer.

## Git workflow

- Shared checkout — run `git branch --show-current` before committing.
- Branch: `feat/034-file-list-keyboard-nav`.
- Commit: `feat: keyboard navigation (arrows/Enter/Delete) in the file list`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create the navigation hook

Create `src/components/browser/use-list-keyboard-nav.ts`. It owns the keydown
listener for list navigation, mirroring `use-pane-keyboard.ts`'s guards
(ignore when typing in inputs; only act when focus is inside the container).
Signature:

```ts
"use client";
import { useEffect } from "react";
import type { S3Object } from "@/types";

export function useListKeyboardNav({
  containerRef,
  objects,
  focusedIndex,
  setFocusedIndex,
  onActivate,
  onDeleteFocused,
  canWrite,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  objects: S3Object[];
  focusedIndex: number;
  setFocusedIndex: (updater: number | ((prev: number) => number)) => void;
  onActivate: (object: S3Object) => void;
  onDeleteFocused: (object: S3Object) => void;
  canWrite: boolean;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const active = document.activeElement;
      const inEditable = active instanceof HTMLElement &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
      if (inEditable) return;
      const focusInside = active === container || (active instanceof Node && container.contains(active));
      if (!focusInside) return;
      if (objects.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min((prev < 0 ? -1 : prev) + 1, objects.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max((prev < 0 ? 0 : prev) - 1, 0));
      } else if (e.key === "Enter") {
        if (focusedIndex >= 0 && focusedIndex < objects.length) {
          e.preventDefault();
          onActivate(objects[focusedIndex]);
        }
      } else if (e.key === "Delete") {
        if (canWrite && focusedIndex >= 0 && focusedIndex < objects.length) {
          e.preventDefault();
          onDeleteFocused(objects[focusedIndex]);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [containerRef, objects, focusedIndex, setFocusedIndex, onActivate, onDeleteFocused, canWrite]);
}
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Add focus-index state and wire the hook in `file-list.tsx`

After the virtualizer setup (around line 102), add:

```tsx
const [focusedIndex, setFocusedIndex] = useState<number>(-1);

// Reset focus when the list identity changes (navigation, filtering).
useEffect(() => { setFocusedIndex(-1); }, [orderedKeys]);

const activateObject = useCallback((object: S3Object) => {
  if (object.isFolder) {
    onNavigate?.(object.key);
  } else {
    onPreview(object);
  }
}, [onNavigate, onPreview]);

const deleteFocused = useCallback((object: S3Object) => {
  onDelete(object.key);
}, [onDelete]);

useListKeyboardNav({
  containerRef,
  objects,
  focusedIndex,
  setFocusedIndex,
  onActivate: activateObject,
  onDeleteFocused: deleteFocused,
  canWrite,
});

// Keep the focused row visible + mounted in the virtualizer.
useEffect(() => {
  if (focusedIndex >= 0) rowVirtualizer.scrollToIndex(focusedIndex, { align: "auto" });
}, [focusedIndex, rowVirtualizer]);
```

Add the needed imports: `useCallback`, `useEffect` from `react` (the file
already imports `useMemo, useRef, useState`), and
`import { useListKeyboardNav } from "./use-list-keyboard-nav";`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Pass `isFocused` to the rendered rows

In the virtual-row map (lines 233-281), pass `isFocused={virtualRow.index === focusedIndex}`
to `<FileRow ... />`. Add it next to `isSelected`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Render the focus ring in `FileRow`

In `file-row.tsx`, add `isFocused?: boolean` to `FileRowProps` (near
`isSelected`), destructure it in `FileRowImpl` (default `false`), and add a
focus-ring class to the `<TableRow>` className:

```tsx
className={cn(
  "group",
  isSelected && "bg-muted",
  isFocused && "ring-2 ring-blue-500 ring-inset",
  isFolderDragOver && object.isFolder && "bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-500 ring-inset"
)}
```

Because `FileRow` is `React.memo`, the new boolean prop participates in the
shallow compare automatically — only the row whose focus state changed
re-renders.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 5: Manual smoke test

Run `pnpm dev`, open a bucket with ≥ 20 objects including at least one folder.
Click once inside the list area to focus the container, then:

1. **ArrowDown/ArrowUp** move a visible focus ring row by row; it stays on
   screen (scrolls when reaching the edge) — including past the initial viewport
   (confirms the virtualizer keeps the focused row mounted).
2. **Enter** on a folder navigates into it; **Enter** on a (previewable) file
   opens the preview.
3. **Delete** on a focused file (when you have write access) triggers the delete
   flow; with read-only access nothing happens.
4. Typing in the "Filter by name…" box does NOT move the focus ring (the hook
   ignores keys while an input is focused), and changing the filter resets focus.
5. Ctrl+A / Escape still behave as before (selection select-all / clear).

**Verify**: all five behaviors observed. Report any deviation.

### Step 6: Full gate

**Verify**: `pnpm test` (all pass), `pnpm typecheck` (exit 0), `pnpm lint`
(exit 0).

## Test plan

- The new hook `use-list-keyboard-nav.ts` is pure-ish (a keydown reducer over an
  index). If a hook/component test harness exists under
  `src/components/browser/*.test.*`, add a unit test for the index math:
  ArrowDown clamps at `objects.length - 1`, ArrowUp clamps at 0, Enter calls
  `onActivate` with `objects[focusedIndex]`, Delete is a no-op when `canWrite`
  is false. Use `@testing-library/react`'s `renderHook` + `fireEvent.keyDown` if
  available.
- If no such harness exists, do NOT build one from scratch; rely on the Step 5
  manual smoke + green `pnpm test`/`typecheck`/`lint`. State in your report which
  path you took.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 (no regressions)
- [ ] `src/components/browser/use-list-keyboard-nav.ts` exists and is imported
      only by `file-list.tsx`
- [ ] `use-pane-keyboard.ts` is unmodified (`git status`)
- [ ] `file-gallery.tsx` is unmodified (`git status`)
- [ ] `grep -n "isFocused" src/components/browser/file-row.tsx` shows the prop
      and the ring class
- [ ] Manual smoke (Step 5) all five behaviors pass
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `useVirtualizer`'s returned object has no `scrollToIndex` on the installed
  `@tanstack/react-virtual` version (check the import/types) — report; do not
  hand-roll scrolling.
- The list is NOT virtualized as excerpted (e.g. rows are rendered directly) —
  the focus-keeps-mounted logic differs; stop and report.
- Adding `isFocused` forces every row to re-render on each arrow press (visible
  jank in dev) — that indicates `FileRow`'s memo or a callback identity broke;
  STOP and report rather than shipping a perf regression (plan 008 specifically
  virtualized + memoized this list).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Ordering vs plan 033**: both edit `file-row.tsx` (033 adds `onContextMenu` +
  controlled menu state; this plan adds the `isFocused` prop + ring class) and
  `file-list.tsx`. They touch different lines and don't conflict, but if both
  are executed, land one, then re-run this plan's drift check before the second
  so the "Current state" excerpts still match.
- Grid-view (`file-gallery.tsx`) keyboard navigation is intentionally deferred —
  it needs 2-D (row/column) movement and a different focus model. If it's built
  later, consider promoting the shared guard logic (input-focus / container-
  focus checks) out of both `use-pane-keyboard.ts` and `use-list-keyboard-nav.ts`
  into one helper.
- Reviewer should scrutinize: the virtualizer `scrollToIndex` effect deps, that
  `FileRow` re-renders are limited to the focus-changed rows, and that the
  Delete key respects `canWrite`.
- Deferred sub-features (not in this plan): Space-to-toggle-selection,
  Shift+Arrow range selection, Home/End jumps, and type-ahead. Add later if
  users ask — each is a small extension of the same hook.
