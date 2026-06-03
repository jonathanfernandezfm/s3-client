# Shift-Click Range Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OS-style multi-selection to the file browser: Shift+Click range, Ctrl/Cmd+Click toggle, Ctrl/Cmd+A select all, Esc to clear — in both list and grid views, on checkbox AND row/tile body.

**Architecture:** A pure helper computes range keys from an ordered list and anchor. The Zustand `browser-store` gains a per-pane `selectionAnchor` and a `setSelectionRange` action. A new `usePaneSelection` hook centralizes click-to-selection logic (consulting modifier keys) and `usePaneKeyboard` handles Ctrl/Cmd+A and Esc scoped to a container. Row/tile components catch modifier-clicks in the capture phase to override the default navigate/preview behavior while leaving plain clicks untouched.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Zustand / Vitest (existing). No new dependencies.

---

## Behavioral Spec

| Interaction | Effect | Anchor change |
|---|---|---|
| Plain click on checkbox | Toggle that item in/out of selection | Anchor = key |
| Plain click on row body / tile body | **Unchanged** — navigate folder / preview file | None |
| Shift+Click anywhere on row/tile (including checkbox, name, icon) | Replace selection with the range from anchor to clicked key (inclusive, in visible order). If no anchor → just select that key. | Anchor unchanged |
| Ctrl/Cmd+Click anywhere on row/tile | Toggle that key in/out of selection. No navigation/preview. | Anchor = key |
| Ctrl/Cmd+A (with focus in pane) | Select all currently-visible keys in this pane | Anchor = first visible key |
| Esc (with focus in pane) | Clear selection | Anchor = null |
| Grid view range | Range walks the rendered group order: folders → images → others | Same |
| Both views | Share selection state per pane (existing behavior preserved) | — |

Inputs/textareas keep their native Ctrl+A/Esc behavior — the keyboard listener bails out when focus is inside an editable element.

---

## File Structure

**Create:**
- `src/lib/selection/range.ts` — pure `computeRangeKeys(orderedKeys, anchor, target)` helper. No React.
- `src/lib/selection/range.test.ts` — Vitest unit tests for the helper.
- `src/components/browser/use-pane-selection.ts` — hook returning `handleSelect(key, modifiers)`, `selectAllInPane()`, `clearSelectionInPane()`. Wraps the store and the range helper.
- `src/components/browser/use-pane-keyboard.ts` — hook that attaches a window-level keydown listener scoped to a container ref. Calls `onSelectAll` / `onClearSelection` for Ctrl/Cmd+A and Esc when focus is inside the container and not in an input.

**Modify:**
- `src/lib/stores/browser-store.ts` — add `selectionAnchor: string | null` to `PaneBrowserState`; add `setSelectionRange(paneId, keys, anchor)` action; update `toggleSelection`, `selectAll`, `clearSelection` to maintain anchor.
- `src/components/browser/file-row.tsx` — change `onSelect` prop signature, add `onClickCapture` on `TableRow`, change checkbox `onChange` → `onClick`.
- `src/components/browser/file-tile.tsx` — change `onSelect` prop signature, add `onClickCapture` on the tile wrapper `<div>` (both folder and non-folder branches), change checkbox `onChange` → `onClick`.
- `src/components/browser/file-list.tsx` — use `usePaneSelection` and `usePaneKeyboard`; pass new event-aware `onSelect`; add container ref + `tabIndex`.
- `src/components/browser/file-gallery.tsx` — same as file-list, but compute the compound visible order (`folders → images → others`).

**Key responsibilities:**
- `range.ts`: pure, deterministic — exhaustively unit-tested.
- `use-pane-selection.ts`: knows the store actions and how modifier keys map to actions. UI-agnostic except for the modifier interface.
- `use-pane-keyboard.ts`: knows the keyboard shortcuts and the focus-scoping rule. View-agnostic.
- Row/Tile: forward MouseEvent to parent; do not own selection logic.
- List/Gallery: own the visible order, instantiate the hooks, wire them into children.

---

## Task 1: Pure `computeRangeKeys` helper + tests

**Files:**
- Create: `src/lib/selection/range.ts`
- Test: `src/lib/selection/range.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/selection/range.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { computeRangeKeys } from "./range";

describe("computeRangeKeys", () => {
  const keys = ["a", "b", "c", "d", "e"];

  test("returns [target] when anchor is null", () => {
    expect(computeRangeKeys(keys, null, "c")).toEqual(["c"]);
  });

  test("returns [target] when anchor is not in the ordered list", () => {
    expect(computeRangeKeys(keys, "z", "c")).toEqual(["c"]);
  });

  test("returns [target] when target is not in the ordered list", () => {
    expect(computeRangeKeys(keys, "a", "z")).toEqual(["z"]);
  });

  test("returns [key] when anchor equals target", () => {
    expect(computeRangeKeys(keys, "c", "c")).toEqual(["c"]);
  });

  test("returns inclusive forward range when anchor is before target", () => {
    expect(computeRangeKeys(keys, "b", "d")).toEqual(["b", "c", "d"]);
  });

  test("returns inclusive backward range when anchor is after target", () => {
    expect(computeRangeKeys(keys, "d", "b")).toEqual(["b", "c", "d"]);
  });

  test("returns full list when anchor is first and target is last", () => {
    expect(computeRangeKeys(keys, "a", "e")).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("returns [target] when the ordered list is empty", () => {
    expect(computeRangeKeys([], "a", "b")).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/selection/range.test.ts`
Expected: FAIL — module `./range` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/selection/range.ts`:

```ts
export function computeRangeKeys(
  orderedKeys: string[],
  anchorKey: string | null,
  targetKey: string
): string[] {
  if (anchorKey === null) return [targetKey];
  const anchorIdx = orderedKeys.indexOf(anchorKey);
  const targetIdx = orderedKeys.indexOf(targetKey);
  if (anchorIdx === -1 || targetIdx === -1) return [targetKey];
  const [start, end] =
    anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
  return orderedKeys.slice(start, end + 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/selection/range.test.ts`
Expected: PASS — 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/selection/range.ts src/lib/selection/range.test.ts
git commit -m "feat(selection): add pure computeRangeKeys helper for shift-click ranges"
```

---

## Task 2: Extend `browser-store` with anchor + range action

**Files:**
- Modify: `src/lib/stores/browser-store.ts`

This task has no automated test (store has no existing tests; component-level verification covers it in later tasks). The change is additive and explicit.

- [ ] **Step 1: Add `selectionAnchor` to `PaneBrowserState`**

Edit `src/lib/stores/browser-store.ts` — replace the `PaneBrowserState` interface (currently lines 4-9):

```ts
interface PaneBrowserState {
  selectedItems: Set<string>;
  selectionAnchor: string | null;
  viewMode: "list" | "grid";
  sortBy: "name" | "size" | "date";
  sortOrder: "asc" | "desc";
}
```

- [ ] **Step 2: Initialize anchor in `createDefaultPaneState`**

Replace `createDefaultPaneState` (currently lines 20-27):

```ts
function createDefaultPaneState(): PaneBrowserState {
  return {
    selectedItems: new Set(),
    selectionAnchor: null,
    viewMode: "list",
    sortBy: "name",
    sortOrder: "asc",
  };
}
```

- [ ] **Step 3: Declare `setSelectionRange` in the `BrowserState` interface**

In the `BrowserState` interface, replace the selection-actions block (currently lines 38-41):

```ts
  // Selection actions (scoped to pane)
  toggleSelection: (paneId: string, key: string) => void;
  setSelectionRange: (paneId: string, keys: string[], anchor: string | null) => void;
  selectAll: (paneId: string, keys: string[]) => void;
  clearSelection: (paneId: string) => void;
```

- [ ] **Step 4: Update `toggleSelection` to set the anchor to the toggled key**

Replace the body of `toggleSelection` (currently lines 97-113):

```ts
  toggleSelection: (paneId, key) => {
    set((state) => {
      const paneState = state.paneStates[paneId] || createDefaultPaneState();
      const newSelection = new Set(paneState.selectedItems);
      if (newSelection.has(key)) {
        newSelection.delete(key);
      } else {
        newSelection.add(key);
      }
      return {
        paneStates: {
          ...state.paneStates,
          [paneId]: {
            ...paneState,
            selectedItems: newSelection,
            selectionAnchor: key,
          },
        },
      };
    });
  },
```

- [ ] **Step 5: Add `setSelectionRange` action immediately after `toggleSelection`**

Insert before `selectAll`:

```ts
  setSelectionRange: (paneId, keys, anchor) => {
    set((state) => {
      const paneState = state.paneStates[paneId] || createDefaultPaneState();
      return {
        paneStates: {
          ...state.paneStates,
          [paneId]: {
            ...paneState,
            selectedItems: new Set(keys),
            selectionAnchor: anchor,
          },
        },
      };
    });
  },
```

- [ ] **Step 6: Update `selectAll` to set anchor to first key**

Replace the body of `selectAll` (currently lines 115-125):

```ts
  selectAll: (paneId, keys) => {
    set((state) => {
      const paneState = state.paneStates[paneId] || createDefaultPaneState();
      return {
        paneStates: {
          ...state.paneStates,
          [paneId]: {
            ...paneState,
            selectedItems: new Set(keys),
            selectionAnchor: keys[0] ?? null,
          },
        },
      };
    });
  },
```

- [ ] **Step 7: Update `clearSelection` to clear anchor**

Replace the body of `clearSelection` (currently lines 127-137):

```ts
  clearSelection: (paneId) => {
    set((state) => {
      const paneState = state.paneStates[paneId] || createDefaultPaneState();
      return {
        paneStates: {
          ...state.paneStates,
          [paneId]: {
            ...paneState,
            selectedItems: new Set(),
            selectionAnchor: null,
          },
        },
      };
    });
  },
```

- [ ] **Step 8: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS — no errors. (If callers anywhere set `PaneBrowserState` literals directly without `selectionAnchor`, TS will flag them. None should — only `createDefaultPaneState` constructs the type.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/stores/browser-store.ts
git commit -m "feat(browser-store): add selectionAnchor and setSelectionRange action"
```

---

## Task 3: Add `usePaneSelection` hook

**Files:**
- Create: `src/components/browser/use-pane-selection.ts`

The hook returns event-driven handlers, decoupled from any specific UI element so both row and tile can use it. The container that knows the visible order calls `usePaneSelection(paneId, orderedKeys)`.

- [ ] **Step 1: Create the hook**

Create `src/components/browser/use-pane-selection.ts`:

```ts
"use client";

import { useCallback } from "react";
import { useBrowserStore } from "@/lib/stores/browser-store";
import { computeRangeKeys } from "@/lib/selection/range";

export interface ModifierKeys {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export function usePaneSelection(paneId: string, orderedKeys: string[]) {
  const toggleSelection = useBrowserStore((s) => s.toggleSelection);
  const setSelectionRange = useBrowserStore((s) => s.setSelectionRange);
  const selectAll = useBrowserStore((s) => s.selectAll);
  const clearSelection = useBrowserStore((s) => s.clearSelection);

  const handleSelect = useCallback(
    (key: string, mods: ModifierKeys) => {
      if (mods.shiftKey) {
        const anchor =
          useBrowserStore.getState().paneStates[paneId]?.selectionAnchor ?? null;
        const range = computeRangeKeys(orderedKeys, anchor, key);
        setSelectionRange(paneId, range, anchor ?? key);
        return;
      }
      // Ctrl/Cmd+Click and plain checkbox click both toggle and re-anchor.
      toggleSelection(paneId, key);
    },
    [paneId, orderedKeys, toggleSelection, setSelectionRange]
  );

  const selectAllInPane = useCallback(() => {
    selectAll(paneId, orderedKeys);
  }, [paneId, orderedKeys, selectAll]);

  const clearSelectionInPane = useCallback(() => {
    clearSelection(paneId);
  }, [paneId, clearSelection]);

  return { handleSelect, selectAllInPane, clearSelectionInPane };
}
```

**Why read anchor via `getState()` inside the callback rather than subscribing:** subscribing to `selectionAnchor` would cause every row in the list to re-render on every selection change. The anchor is only needed at the moment of click, so we read it imperatively from the store.

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/browser/use-pane-selection.ts
git commit -m "feat(browser): add usePaneSelection hook for modifier-aware selection"
```

---

## Task 4: Add `usePaneKeyboard` hook

**Files:**
- Create: `src/components/browser/use-pane-keyboard.ts`

- [ ] **Step 1: Create the hook**

Create `src/components/browser/use-pane-keyboard.ts`:

```ts
"use client";

import { useEffect } from "react";

export function usePaneKeyboard({
  containerRef,
  onSelectAll,
  onClearSelection,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  onSelectAll: () => void;
  onClearSelection: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const active = document.activeElement;
      const inEditable =
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable);
      if (inEditable) return;

      const focusInside =
        active === container ||
        (active instanceof Node && container.contains(active));
      if (!focusInside) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        onSelectAll();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClearSelection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [containerRef, onSelectAll, onClearSelection]);
}
```

**Why the `focusInside` check:** in a multi-pane layout we only want the pane the user has clicked into to respond. Body-level focus (no specific pane) is excluded so a single Ctrl+A doesn't fire on every pane.

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/browser/use-pane-keyboard.ts
git commit -m "feat(browser): add usePaneKeyboard hook for Ctrl/Cmd+A and Esc"
```

---

## Task 5: Update `FileRow` to pass modifier events

**Files:**
- Modify: `src/components/browser/file-row.tsx`

- [ ] **Step 1: Change `onSelect` prop signature**

In `FileRowProps` (lines 32-54), replace:

```ts
  onSelect: () => void;
```

with:

```ts
  onSelect: (mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
```

- [ ] **Step 2: Add `onClickCapture` on `TableRow` to intercept modifier-clicks**

In the JSX, replace the `<TableRow ...>` opening tag (currently lines 115-125) with:

```tsx
    <TableRow
      className={cn(
        isSelected && "bg-muted",
        isFolderDragOver && object.isFolder && "bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-500 ring-inset"
      )}
      data-state={isSelected ? "selected" : undefined}
      draggable
      {...dragHandlers}
      {...(folderDropHandlers ?? {})}
      onClickCapture={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          onSelect({ shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
        }
      }}
      style={{ cursor: "grab" }}
    >
```

**Why `onClickCapture`:** it runs in the capture phase, before any descendant `onClick` (the inner `<Link>`, the preview span, the star button). When a modifier is held we stop propagation, so the inner handler never fires and the Link's navigation is prevented.

- [ ] **Step 3: Replace the checkbox `onChange` with `onClick`**

Replace the checkbox (currently lines 126-133):

```tsx
      <TableCell className="w-8">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          onClick={(e) => {
            e.stopPropagation();
            onSelect({ shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
          }}
          className="h-4 w-4 rounded border-gray-300"
        />
      </TableCell>
```

**Why empty `onChange`:** React controlled-checkbox warning silencer. State is driven by `onClick` → store → `isSelected` prop. (`onClick` fires before `onChange`, and our `stopPropagation` here is defensive: the row-level `onClickCapture` already returned without acting for plain clicks, but if any modifier was held it stopped propagation before this fires.)

- [ ] **Step 4: Type-check**

Run: `pnpm tsc --noEmit`
Expected: error in `file-list.tsx` because the existing `onSelect={() => toggleSelection(...)}` no longer matches the new signature. Leave it failing — Task 7 fixes it. If TS is too disruptive, you may temporarily wrap callers with `onSelect={() => onSelect({} as any)}` but prefer to move straight into Task 6 / Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/components/browser/file-row.tsx
git commit -m "feat(file-row): forward modifier keys via onSelect; capture modifier-clicks"
```

---

## Task 6: Update `FileTile` to pass modifier events

**Files:**
- Modify: `src/components/browser/file-tile.tsx`

The tile has two render branches (folder vs non-folder). Both need updating.

- [ ] **Step 1: Change `onSelect` prop signature**

In `FileTileProps` (lines 18-38), replace:

```ts
  onSelect: () => void;
```

with:

```ts
  onSelect: (mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
```

- [ ] **Step 2: Add `onClickCapture` on the folder-branch outer `<div>`**

Replace the folder branch's outer `<div ...>` (currently lines 81-91):

```tsx
      <div
        className={cn(
          "group relative",
          isBeingDragged && isDragging && "opacity-50"
        )}
        draggable
        onDragStart={dragHandlers.onDragStart}
        onDragEnd={dragHandlers.onDragEnd}
        {...(folderDropHandlers ?? {})}
        onClickCapture={(e) => {
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            onSelect({ shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
          }
        }}
        style={{ cursor: "grab" }}
      >
```

- [ ] **Step 3: Replace folder-branch checkbox `onChange` with `onClick`**

Replace the folder branch's checkbox (currently lines 92-98):

```tsx
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          onClick={(e) => {
            e.stopPropagation();
            onSelect({ shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
          }}
          data-selected={isSelected}
          className="absolute top-2 left-2 h-4 w-4 rounded border-gray-300 opacity-0 group-hover:opacity-100 data-[selected=true]:opacity-100 z-10"
        />
```

- [ ] **Step 4: Add `onClickCapture` on the file-branch outer `<div>`**

Replace the non-folder branch's outer `<div ...>` (currently lines 133-143):

```tsx
    <div
      className={cn(
        "group relative",
        isBeingDragged && isDragging && "opacity-50"
      )}
      draggable
      onDragStart={dragHandlers.onDragStart}
      onDragEnd={dragHandlers.onDragEnd}
      {...(folderDropHandlers ?? {})}
      onClickCapture={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          onSelect({ shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
        }
      }}
      style={{ cursor: "grab" }}
    >
```

- [ ] **Step 5: Replace file-branch checkbox `onChange` with `onClick`**

Replace the non-folder branch's checkbox (currently lines 145-151):

```tsx
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => {}}
        onClick={(e) => {
          e.stopPropagation();
          onSelect({ shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
        }}
        data-selected={isSelected}
        className="absolute top-2 left-2 h-4 w-4 rounded border-gray-300 opacity-0 group-hover:opacity-100 data-[selected=true]:opacity-100 z-10"
      />
```

- [ ] **Step 6: Commit**

```bash
git add src/components/browser/file-tile.tsx
git commit -m "feat(file-tile): forward modifier keys via onSelect; capture modifier-clicks"
```

---

## Task 7: Wire `FileList` to use `usePaneSelection` and `usePaneKeyboard`

**Files:**
- Modify: `src/components/browser/file-list.tsx`

- [ ] **Step 1: Add the new imports**

Replace the imports block at the top (currently lines 1-14) with:

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileRow } from "./file-row";
import { useBrowserStore } from "@/lib/stores/browser-store";
import { usePaneSelection } from "./use-pane-selection";
import { usePaneKeyboard } from "./use-pane-keyboard";
import { cn } from "@/lib/utils";
import type { S3Object } from "@/types";
```

- [ ] **Step 2: Replace the selection-actions destructure + add the hooks**

Find the block that begins (currently lines 66-71):

```tsx
  const { getPaneState, toggleSelection, selectAll, clearSelection } =
    useBrowserStore();

  const paneState = getPaneState(paneId);
  const selectedItems = paneState.selectedItems;
  const [isListDragOver, setIsListDragOver] = useState(false);
```

Replace it with:

```tsx
  const getPaneState = useBrowserStore((s) => s.getPaneState);

  const paneState = getPaneState(paneId);
  const selectedItems = paneState.selectedItems;
  const [isListDragOver, setIsListDragOver] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const orderedKeys = useMemo(() => objects.map((o) => o.key), [objects]);
  const { handleSelect, selectAllInPane, clearSelectionInPane } =
    usePaneSelection(paneId, orderedKeys);
  usePaneKeyboard({
    containerRef,
    onSelectAll: selectAllInPane,
    onClearSelection: clearSelectionInPane,
  });
```

- [ ] **Step 3: Update `handleSelectAll` to use the new helpers**

Replace the existing `handleSelectAll` (currently lines 77-83):

```tsx
  const handleSelectAll = () => {
    if (allSelected) {
      clearSelectionInPane();
    } else {
      selectAllInPane();
    }
  };
```

- [ ] **Step 4: Attach `containerRef` and `tabIndex` to the outer container**

Find the empty-state container (currently lines 138-147) — replace its opening tag with:

```tsx
      <div
        ref={containerRef}
        tabIndex={0}
        className={cn(
          "flex flex-col items-center justify-center flex-1 min-h-[200px] py-12 text-center transition-colors outline-none",
          isListDragOver && isValidDropTarget && "bg-blue-50 dark:bg-blue-950"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
```

Find the main container (currently lines 157-166) — replace its opening tag with:

```tsx
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn(
        "flex flex-col flex-1 min-h-[200px] transition-colors outline-none",
        isListDragOver && isValidDropTarget && "ring-2 ring-blue-500 ring-inset bg-blue-50/50 dark:bg-blue-950/50"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
```

(`outline-none` keeps the keyboard focus invisible — we don't want a permanent ring around the file list when clicked. If you'd prefer a focus ring for accessibility, change to `focus-visible:ring-2`.)

- [ ] **Step 5: Pass the new `onSelect` to each `FileRow`**

Replace the `<FileRow ... />` block (currently lines 186-208) so that the `onSelect` prop becomes:

```tsx
              onSelect={(mods) => handleSelect(object.key, mods)}
```

Leave every other prop unchanged. The full row remains:

```tsx
          {objects.map((object) => (
            <FileRow
              key={object.key}
              object={object}
              connectionId={connectionId}
              bucket={bucket}
              currentPath={currentPath}
              canWrite={canWrite}
              isSelected={selectedItems.has(object.key)}
              onSelect={(mods) => handleSelect(object.key, mods)}
              onDelete={() => onDelete(object.key)}
              onPreview={() => onPreview(object)}
              onDownload={() => onDownload(object.key)}
              onNavigate={onNavigate}
              paneId={paneId}
              allObjects={objects}
              selectedItems={selectedItems}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onFolderDrop={handleFolderDrop}
              isDragging={isDragging}
              canDropOnFolder={isValidDropTarget && canWrite}
              noteCount={object.isFolder ? (folderNoteCounts[object.key] ?? 0) : 0}
            />
          ))}
```

- [ ] **Step 6: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS for `file-list.tsx` and `file-row.tsx`. Errors should now only remain in `file-gallery.tsx` (handled in Task 8).

- [ ] **Step 7: Commit**

```bash
git add src/components/browser/file-list.tsx
git commit -m "feat(file-list): wire modifier-aware selection and pane keyboard shortcuts"
```

---

## Task 8: Wire `FileGallery` to use `usePaneSelection` (compound order) and `usePaneKeyboard`

**Files:**
- Modify: `src/components/browser/file-gallery.tsx`

The gallery groups objects into folders → images → others, and ranges must walk that exact rendered order.

- [ ] **Step 1: Add the new imports**

Replace the imports block (currently lines 1-8):

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { FileTile } from "./file-tile";
import { usePresignedUrls } from "@/lib/queries/presign";
import { useBrowserStore } from "@/lib/stores/browser-store";
import { usePaneSelection } from "./use-pane-selection";
import { usePaneKeyboard } from "./use-pane-keyboard";
import { isImageFile, cn } from "@/lib/utils";
import type { S3Object } from "@/types";
```

- [ ] **Step 2: Compute the compound visible order and wire the hooks**

Find the block (currently lines 57-67):

```tsx
  const { getPaneState, toggleSelection } = useBrowserStore();
  const paneState = getPaneState(paneId);
  const selectedItems = paneState.selectedItems;
  const [isGalleryDragOver, setIsGalleryDragOver] = useState(false);

  const folderObjects = objects.filter((o) => o.isFolder);
  const imageObjects = objects.filter((o) => !o.isFolder && isImageFile(o.key));
  const otherObjects = objects.filter((o) => !o.isFolder && !isImageFile(o.key));

  const imageKeys = useMemo(() => imageObjects.map((o) => o.key), [imageObjects]);
  const thumbnailUrls = usePresignedUrls(connectionId, bucket, imageKeys);
```

Replace with:

```tsx
  const getPaneState = useBrowserStore((s) => s.getPaneState);
  const paneState = getPaneState(paneId);
  const selectedItems = paneState.selectedItems;
  const [isGalleryDragOver, setIsGalleryDragOver] = useState(false);

  const folderObjects = useMemo(() => objects.filter((o) => o.isFolder), [objects]);
  const imageObjects = useMemo(
    () => objects.filter((o) => !o.isFolder && isImageFile(o.key)),
    [objects]
  );
  const otherObjects = useMemo(
    () => objects.filter((o) => !o.isFolder && !isImageFile(o.key)),
    [objects]
  );

  const imageKeys = useMemo(() => imageObjects.map((o) => o.key), [imageObjects]);
  const thumbnailUrls = usePresignedUrls(connectionId, bucket, imageKeys);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const orderedKeys = useMemo(
    () => [
      ...folderObjects.map((o) => o.key),
      ...imageObjects.map((o) => o.key),
      ...otherObjects.map((o) => o.key),
    ],
    [folderObjects, imageObjects, otherObjects]
  );
  const { handleSelect, selectAllInPane, clearSelectionInPane } =
    usePaneSelection(paneId, orderedKeys);
  usePaneKeyboard({
    containerRef,
    onSelectAll: selectAllInPane,
    onClearSelection: clearSelectionInPane,
  });
```

- [ ] **Step 3: Attach `containerRef` and `tabIndex` to the gallery containers**

Find the empty-state container (currently lines 115-124) — replace its opening tag with:

```tsx
      <div
        ref={containerRef}
        tabIndex={0}
        className={cn(
          "flex flex-col items-center justify-center flex-1 min-h-[200px] py-12 text-center transition-colors outline-none",
          isGalleryDragOver && isValidDropTarget && "bg-blue-50 dark:bg-blue-950"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
```

Find the main container (currently lines 132-143) — replace its opening tag with:

```tsx
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn(
        "flex flex-col flex-1 min-h-[200px] transition-colors outline-none",
        isGalleryDragOver &&
          isValidDropTarget &&
          "ring-2 ring-blue-500 ring-inset bg-blue-50/50 dark:bg-blue-950/50"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
```

- [ ] **Step 4: Update each `FileTile` to use the modifier-aware `onSelect`**

There are three `.map` loops (folders, images, others). In each, replace:

```tsx
            onSelect={() => toggleSelection(paneId, object.key)}
```

with:

```tsx
            onSelect={(mods) => handleSelect(object.key, mods)}
```

For clarity, the folder loop becomes (currently lines 145-167):

```tsx
        {folderObjects.map((object) => (
          <FileTile
            key={object.key}
            object={object}
            connectionId={connectionId}
            bucket={bucket}
            currentPath={currentPath}
            canWrite={canWrite}
            isSelected={selectedItems.has(object.key)}
            onSelect={(mods) => handleSelect(object.key, mods)}
            onPreview={() => onPreview(object)}
            onNavigate={onNavigate}
            paneId={paneId}
            allObjects={objects}
            selectedItems={selectedItems}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onFolderDrop={handleFolderDrop}
            isDragging={isDragging}
            canDropOnFolder={isValidDropTarget && canWrite}
            noteCount={folderNoteCounts[object.key] ?? 0}
          />
        ))}
```

The images loop becomes (currently lines 168-190):

```tsx
        {imageObjects.map((object) => (
          <FileTile
            key={object.key}
            object={object}
            connectionId={connectionId}
            bucket={bucket}
            currentPath={currentPath}
            canWrite={canWrite}
            isSelected={selectedItems.has(object.key)}
            onSelect={(mods) => handleSelect(object.key, mods)}
            onPreview={() => onPreview(object)}
            onNavigate={onNavigate}
            thumbnailUrl={thumbnailUrls[object.key]}
            paneId={paneId}
            allObjects={objects}
            selectedItems={selectedItems}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onFolderDrop={handleFolderDrop}
            isDragging={isDragging}
            canDropOnFolder={isValidDropTarget && canWrite}
          />
        ))}
```

The others loop becomes (currently lines 191-212):

```tsx
        {otherObjects.map((object) => (
          <FileTile
            key={object.key}
            object={object}
            connectionId={connectionId}
            bucket={bucket}
            currentPath={currentPath}
            canWrite={canWrite}
            isSelected={selectedItems.has(object.key)}
            onSelect={(mods) => handleSelect(object.key, mods)}
            onPreview={() => onPreview(object)}
            onNavigate={onNavigate}
            paneId={paneId}
            allObjects={objects}
            selectedItems={selectedItems}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onFolderDrop={handleFolderDrop}
            isDragging={isDragging}
            canDropOnFolder={isValidDropTarget && canWrite}
          />
        ))}
```

- [ ] **Step 5: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS — no remaining errors.

- [ ] **Step 6: Run lint**

Run: `pnpm lint`
Expected: PASS — no new warnings.

- [ ] **Step 7: Commit**

```bash
git add src/components/browser/file-gallery.tsx
git commit -m "feat(file-gallery): wire modifier-aware selection across compound visible order"
```

---

## Task 9: Manual verification

This task is acceptance testing. Run through every interaction; if any step fails, stop and diagnose.

**Files:** none modified.

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Expected: server starts; open `http://localhost:3000`, sign in, navigate to any bucket folder with ≥ 5 items.

- [ ] **Step 2: Verify list view — plain checkbox toggle**

- Click checkbox on item A → A becomes selected.
- Click checkbox on item A again → A becomes deselected.
- Expected: anchor lands on A but is internal — no visible change beyond the checkbox highlight.

- [ ] **Step 3: Verify list view — plain row click still navigates / previews**

- Click the file name of a folder (no modifier) → navigates into folder.
- Go back. Click the file name of a previewable file → opens preview.
- Click an empty area of a non-folder row → nothing happens (existing behavior).
- Expected: no selection change for plain row clicks.

- [ ] **Step 4: Verify list view — Shift+Click range**

- Click checkbox on item A (3rd item) → A selected; anchor = A.
- Shift+Click checkbox on item E (7th item) → A, B, C, D, E all selected.
- Shift+Click item B → selection becomes A, B (range from A to B).
- Shift+Click on the file name (not the checkbox) of item D, with Shift held → selection becomes A, B, C, D. Verify the Link did NOT navigate.
- Expected: range always walks the table render order; anchor stays at A.

- [ ] **Step 5: Verify list view — Ctrl/Cmd+Click toggle**

- With A and B selected, Ctrl/Cmd+Click item D (on the row body, not the checkbox) → D is added; selection = A, B, D. Link did NOT navigate.
- Ctrl/Cmd+Click D again → D removed; selection = A, B.
- Expected: anchor moves to D after the add.

- [ ] **Step 6: Verify list view — Ctrl/Cmd+A and Esc**

- Click anywhere inside the file list (focuses container).
- Press Ctrl+A (or Cmd+A on Mac) → every visible item is selected.
- Press Esc → selection clears.
- Click into a text input outside the list, press Ctrl+A → only the input's text is selected; list is unaffected.

- [ ] **Step 7: Verify grid view — same five behaviors**

- Switch to grid via the view-mode toggle.
- Repeat steps 2-6 in grid mode. Range selection should walk folders → images → other files. Shift+clicking from a folder to an image at the end should include every item in between.

- [ ] **Step 8: Verify view toggle preserves selection**

- Select several items in list view → toggle to grid → same items still highlighted.
- Toggle back to list → still highlighted.

- [ ] **Step 9: Verify drag-and-drop still works with the new selection**

- Select 3 items via Shift+Click.
- Drag one of the selected items into a target folder → all 3 dragged (existing multi-drag behavior must still trigger).

- [ ] **Step 10: Verify bulk-ops panel still appears**

- Select 2+ items → the bottom "N selected" bulk-ops panel appears. Rename / Tag / Delete still work. After a successful op the selection should clear and the panel should hide.

- [ ] **Step 11: Verify no regressions in the rest of the UI**

- Open the dropdown menu (`MoreVertical`) on a row → it should open normally.
- Click the bookmark star on a folder → it should toggle without changing selection.
- Click a folder note count badge → existing behavior unchanged.

- [ ] **Step 12: Commit any fixes**

If any verification step required a code change, commit each fix separately with a clear message. If everything passed cleanly, no commit needed for this task.

---

## Notes and edge cases

- **Empty pane:** `orderedKeys = []`. `selectAll([])` clears selection and sets anchor to null — fine. Ctrl+A in an empty pane is a no-op.
- **Single item:** Shift+Click on the only item with no anchor → just selects that item.
- **Deleted anchor item:** If the user deletes the anchor item, the store's anchor still references the deleted key. On the next Shift+Click `computeRangeKeys` sees the anchor is no longer in `orderedKeys` and falls back to `[targetKey]`. Acceptable — anchor effectively resets.
- **Folder navigation resets selection?** Not handled here. The selection state is per-pane and survives navigation; if the user navigates into a folder, the previous selection's keys are no longer visible but remain in `selectedItems`. This is existing behavior; out of scope.
- **`outline-none` on the container:** the focus ring would otherwise appear around the entire file list when clicked. If accessibility audits demand a visible focus state, switch to `focus-visible:ring-2 focus-visible:ring-blue-500` instead.
- **Range in grid view spans groups:** explicit design choice. Matches the user's selection ("Both list and grid"). If users find this confusing later, the alternative is to clamp ranges within a single group.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-03-shift-click-range-selection.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
