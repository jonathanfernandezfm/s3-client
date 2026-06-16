# Plan 008: Virtualize the file browser's list view and stabilize `FileRow` rendering

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 6dbaee9..HEAD -- src/components/browser/file-list.tsx src/components/browser/file-row.tsx src/components/browser/file-gallery.tsx src/components/browser/file-tile.tsx src/components/browser/file-browser.tsx package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (virtualization changes scroll-container layout; selection/keyboard interactions touch the same surface)
- **Depends on**: [[003-clean-verification-baseline]]
- **Category**: perf
- **Planned at**: commit `6dbaee9`, 2026-06-13

## Why this matters

`APPLICATION_PLAN.md` lists "Virtual scrolling for large file lists" as a
design consideration, but the file browser still renders every object as
a real DOM row (`src/components/browser/file-list.tsx:206-235`
`<TableBody>{objects.map((object) => <FileRow … />)}</TableBody>`). Folders
holding thousands of objects (a real S3 use case) trigger a full layout
reflow on every parent render — and parent re-renders happen on every
selection-set change, sort, filter, and DnD interaction.

Two compounding problems:

1. **`FileRow` is not memoized.** `src/components/browser/file-row.tsx:38`
   exports the component bare. Even with virtualization, every visible row
   re-renders on every parent render.
2. **All callbacks are fresh closures per parent render.** `file-list.tsx:216-233`
   passes `onSelect={(mods) => handleSelect(object.key, mods)}`,
   `onDelete={() => onDelete(object.key)}`, `onPreview={() => onPreview(object)}`,
   and ~8 others as inline arrow functions. Wrapping `FileRow` in
   `React.memo` won't help until those props become referentially stable.

Combined fix: introduce row virtualization with `@tanstack/react-virtual`,
memoize `FileRow`, and switch the per-row callback shape so identity is
stable across renders.

`file-gallery.tsx` (grid view) has the same shape but is out of scope this
plan — apply the same pattern in a follow-up once the list-view migration
proves stable.

## Current state

### `file-list.tsx`

`src/components/browser/file-list.tsx` (verified at `6dbaee9`):

- 247 LOC client component.
- Reads `selectedItems` from the pane's `useBrowserStore` slice
  (`paneState.selectedItems` at line 79).
- Uses `usePaneSelection(paneId, orderedKeys)` from `./use-pane-selection`
  which returns `{ handleSelect, selectAllInPane, clearSelectionInPane }`.
- Uses `usePaneKeyboard` for keyboard shortcuts.
- Renders rows inside `<TableBody>` (lines 206–235) with the inline-arrow
  callbacks listed above.
- The container is a `<div ref={containerRef} … >` (line 179) with
  `<Table>` inside. Container is `flex flex-col flex-1`, so it grows to
  fill its parent.

### `file-row.tsx`

`src/components/browser/file-row.tsx`:

- 370 LOC.
- Default export NOT memoized — line 38 reads `export function FileRow(...)`.
- Accepts ~15 props, three of which are arrow functions today
  (`onSelect`, `onDelete`, `onPreview`, `onDownload`, `onFolderDrop`,
  optionally `onDragStart`, `onDragEnd`, `onTagClick`, `onNavigate`).
- Internal state: `useState` for hover / context-menu visibility — fine.
- Renders a `<TableRow>` with `<TableCell>` children.

### `file-browser.tsx`

`src/components/browser/file-browser.tsx` (the 756-LOC parent — large but
mostly state-management code):

- Defines `onDelete`, `onPreview`, `onDownload`, `onTagClick` and passes
  them down. Most are NOT wrapped in `useCallback`.
- Controls `activeTag`, `folderNoteCounts`, `fileShareCounts`, `fileTags`
  via state. These re-render the whole subtree on change.

### Dependencies

`package.json` does NOT have `@tanstack/react-virtual`. It has
`@tanstack/react-query`; same author, same general API style — add
`@tanstack/react-virtual` v3 (latest stable on React 19).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Add the virtualizer | `pnpm add @tanstack/react-virtual` | added to dependencies; resolves to v3.x |
| Tests | `pnpm test` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Build | `pnpm build` | exit 0 |
| Manual perf check | `pnpm dev` and open the browser in a bucket with >1000 objects | scrolling is smooth; DOM-row count stays low |

Plan 003 establishes the clean composite baseline.

## Scope

**In scope** (the only files you should create or modify):

- `package.json` — add `@tanstack/react-virtual`.
- `src/components/browser/file-list.tsx` — switch the `<TableBody>` map to a virtualized renderer; switch per-row callbacks to identity-stable shapes.
- `src/components/browser/file-row.tsx` — wrap in `React.memo`; tighten props.
- `src/components/browser/file-browser.tsx` — wrap the callbacks passed down to `FileList` (`onDelete`, `onPreview`, `onDownload`, `onTagClick`, `onDragStart`, `onDragEnd`) in `useCallback`.
- `plans/README.md` — status row.

**Out of scope** (do NOT touch):

- `src/components/browser/file-gallery.tsx` and `file-tile.tsx` (grid view) — follow-up plan.
- `src/components/browser/file-browser.tsx` re-architecture (its 756 LOC are noisy but the surface of *this* plan is the callbacks it hands to `FileList`).
- `useBrowserStore`, `usePaneSelection`, `usePaneKeyboard` — leave intact.
- DnD logic; preserve drag handlers byte-for-byte.
- Server-side pagination — the browser already pages via React Query's `useInfiniteQuery` (verified at `src/lib/queries/objects.ts:100-127`); virtualization is a render concern only.
- Any other components.

## Git workflow

- Branch: `perf/virtualize-file-list` off `main`.
- Suggested commits:
  - `chore(deps): add @tanstack/react-virtual`
  - `perf(browser): memoize FileRow and switch to id-keyed row callbacks`
  - `perf(browser): virtualize file-list view`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the virtualizer

```bash
pnpm add @tanstack/react-virtual
```

Verify the version is 3.x (React 19 compatible per their changelog).

**Verify**: `grep '@tanstack/react-virtual' package.json` → one match in
dependencies.

### Step 2: Switch `FileRow` callbacks to id-keyed shapes

The per-row prop closures (`(mods) => handleSelect(object.key, mods)`)
generate a fresh function per row per parent render. Replace them with
shapes that don't capture `object`:

In `file-row.tsx`, change these three prop types so the row receives
the object key and the parent receives that key in the callback:

- `onSelect: (mods: SelectModifiers) => void` → `onSelect: (key: string, mods: SelectModifiers) => void`
  (where `SelectModifiers` is whatever the existing type is — read from
  `use-pane-selection.ts` and reuse).
- `onDelete: () => void` → `onDelete: (key: string) => void`.
- `onPreview: () => void` → `onPreview: (object: S3Object) => void`.
- `onDownload: () => void` → `onDownload: (key: string) => void`.
- `onFolderDrop: (folder: string) => void` stays as-is (no closure).
- `onTagClick: (tag: string) => void` stays as-is.

Inside the row, call `onSelect(object.key, mods)`, `onDelete(object.key)`,
etc. The row then becomes invariant under selection-of-other-rows.

Wrap the export:

```tsx
function FileRowImpl(props: FileRowProps) {
  // … existing body …
}

// Memoize: re-render only when props change by identity / value.
// String/number/boolean/null props compare cheaply; the parent now passes
// stable callback identities (see file-list.tsx Step 3).
export const FileRow = React.memo(FileRowImpl);
```

If a prop is an object whose identity changes per render but whose contents
don't (e.g. `S3Object`), confirm the parent passes the same reference for
the same key — the list-view parent already does (objects come from React
Query, which preserves references between renders). If not, add a custom
equality function.

**Verify**: `pnpm typecheck` → exit 0 (the type changes ripple through
to `file-list.tsx`; fix call sites in Step 3 before re-running).

### Step 3: Update `file-list.tsx` to pass identity-stable callbacks

After Step 2, `file-list.tsx:216-233` no longer needs inline arrow
functions. Replace them with the callback props it already receives,
unchanged:

```tsx
<FileRow
  key={object.key}
  object={object}
  connectionId={connectionId}
  bucket={bucket}
  currentPath={currentPath}
  canWrite={canWrite}
  isSelected={selectedItems.has(object.key)}
  onSelect={handleSelect}        // (key, mods) — was inline closure
  onDelete={onDelete}            // (key) — already key-shaped, unwrap closure
  onPreview={onPreview}          // (object)
  onDownload={onDownload}        // (key)
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
  shareCount={!object.isFolder ? (fileShareCounts[object.key] ?? 0) : 0}
  tags={!object.isFolder ? (fileTags[object.key] ?? []) : []}
  activeTag={activeTag}
  onTagClick={onTagClick}
/>
```

NOTE: `noteCount`, `shareCount`, `tags` are still computed inline. These
are primitive/array values; if the underlying maps update only when their
content changes (verify with the React Query cache shape), the props will
have stable values. If they cause re-renders even with memo, accept it —
they're per-row and small.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Wrap parent callbacks in `useCallback`

In `src/components/browser/file-browser.tsx`, find the definitions of
`onDelete`, `onPreview`, `onDownload`, `onTagClick`, `onDragStart`,
`onDragEnd` (and anything else passed to `<FileList>` that's a function).
Wrap each in `useCallback` with the right dep array. Most of these
already capture `connectionId` and `bucket` from props — those are the
dep array.

Read the existing definitions before editing; if any callback already has
a `useCallback`, leave it. If a callback is defined inside a render-body
inline arrow when passed (`onDelete={(key) => deleteMutation.mutate(key)}`),
extract it:

```tsx
const onDelete = useCallback(
  (key: string) => deleteMutation.mutate(key),
  [deleteMutation],
);
```

(Mutation references from React Query are stable across renders, so the
dep array is small.)

**Verify**: `pnpm typecheck && pnpm lint` → exit 0. Lint may flag missing
deps via `react-hooks/exhaustive-deps`; fix per the rule.

### Step 5: Virtualize the list

Replace the `<Table>` block in `file-list.tsx` (around lines 190–237)
with a virtualized scroll container. The simplest faithful translation
keeps the `<Table>` for accessibility (semantics matter for screen readers
on tabular file lists) and uses an absolutely-positioned overlay for
virtualization. Pattern:

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

const ROW_HEIGHT = 48; // px — match the actual TableRow height; measure once with devtools

const scrollRef = useRef<HTMLDivElement | null>(null);

const rowVirtualizer = useVirtualizer({
  count: objects.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => ROW_HEIGHT,
  overscan: 8,
});

// …

return (
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleSelectAll}
            />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Modified</TableHead>
          <TableHead className="w-8"></TableHead>
        </TableRow>
      </TableHeader>
    </Table>

    <div
      ref={scrollRef}
      className="flex-1 overflow-auto"
      style={{ position: "relative" }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const object = objects[virtualRow.index];
          return (
            <div
              key={object.key}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                height: `${virtualRow.size}px`,
              }}
            >
              <FileRow
                /* all props from Step 3 */
              />
            </div>
          );
        })}
      </div>
    </div>

    {isListDragOver && isValidDropTarget && (
      <div className="flex-1 flex items-center justify-center text-sm text-blue-600 dark:text-blue-400">
        Drop here to add to this folder
      </div>
    )}
  </div>
);
```

Important details:

- The header and body are now in *separate* `<Table>` elements (or just
  use one `<Table>` with the body holding the absolute overlay if your
  CSS works — try the simpler split first). HTML doesn't allow arbitrary
  positioning inside `<tbody>`, so most virtualized table patterns use
  the split approach.
- `ROW_HEIGHT` must match the actual rendered row height. Verify in the
  browser devtools; adjust the constant. If row heights vary, switch to
  `measureElement` per the react-virtual docs (rare; rows look uniform
  today).
- The `Table` columns no longer maintain alignment between header and
  virtualized rows because the header's `Table` has no body. Use a CSS
  grid or fixed widths on `TableHead` to keep column widths the same.
  Quick fix: wrap each `FileRow` cell with the same `w-*` Tailwind
  classes the `TableHead` uses; if `FileRow` already does this internally,
  inspect and align.
- Keyboard navigation (`usePaneKeyboard`) currently uses `containerRef`;
  that still works because the outer div is the focus container.
- DnD: the drop overlay's `isListDragOver` check must still fire over the
  scroll region. Test drag-over a folder row, then drag-over empty space
  below the rows.

If the rough split-table approach causes alignment headaches, the
alternative is `react-virtual` over a flat list rendered as
`<div role="grid">` / `<div role="row">` with ARIA, dropping `<Table>`
entirely. That's a more invasive rewrite — try the split-table first.

**Verify**:
- `pnpm typecheck && pnpm lint` → exit 0.
- `pnpm dev`, open a folder with `>1000` objects:
  - DOM-row count via devtools is ≤ ~50 (overscan + visible window).
  - Scroll is smooth (no jank).
  - Selecting a row, then ranging via Shift+click, still works.
  - Keyboard Down/Up/Home/End still navigates rows.
  - Dragging a row over a folder still triggers the drop overlay.

If a folder with 5–10 objects renders correctly (the virtualizer's
short-list path), proceed.

### Step 6: Composite gate

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

Expected: exit 0.

## Test plan

This plan has no unit tests for the rendering changes (the existing test
infrastructure doesn't render the browser tree; `landing-page.test.tsx`
is the only component test). Verification is the smoke walk in Step 5
plus the existing helper tests:

- `src/lib/selection/range.test.ts` — selection logic still passes.
- `src/components/browser/bucket-list-helpers.test.ts` etc. — unrelated;
  pass.

A component test for `FileList` is a worthwhile follow-up but out of
scope for this plan — the harness for it lives in plan 007.

## Done criteria

ALL must hold:

- [ ] `@tanstack/react-virtual` appears in `package.json` dependencies.
- [ ] `pnpm test && pnpm typecheck && pnpm lint && pnpm build` exits 0.
- [ ] `grep -c "React.memo" src/components/browser/file-row.tsx` → at least `1`.
- [ ] `grep -c "useVirtualizer" src/components/browser/file-list.tsx` → at least `1`.
- [ ] No inline arrow functions remain in the FileRow prop block of `file-list.tsx` (the row callbacks `onSelect`, `onDelete`, `onPreview`, `onDownload` are passed as bare references).
- [ ] In `pnpm dev`, opening a folder with >1k objects keeps the DOM row count below ~50 and scrolling is smooth.
- [ ] Selection (single + shift+click + ctrl+click), keyboard nav (Up/Down/Home/End/Space), and DnD (drag from row, drop on folder, drop on list whitespace) all still behave identically to `main`.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Column alignment between the header `<Table>` and the virtualized rows
  cannot be made pixel-correct via Tailwind `w-*` classes — the
  alternative (drop `<Table>` for `role="grid"`) is a bigger change and
  needs operator OK.
- A row's height varies materially (e.g. tag chips wrap). The constant
  `ROW_HEIGHT` won't work; switching to `measureElement` is fine but
  ask before doing it (changes the perf profile).
- DnD breaks because the absolute-positioned row divs intercept events
  in a way the unwrapped row didn't. Likely fix: forward
  `onDragStart`/`onDragOver` from the wrapper div, or set
  `pointer-events: none` on the wrapper and put the events on the row.
- Selection state cascades cause every row to re-render despite the memo
  — that means `paneState.selectedItems` is being recreated each parent
  render (it's a `Set`). If so, narrow the `useBrowserStore` selector to
  return `(key) => boolean` instead, and pass that function down (still
  stable identity per render). This is a real change; ask before doing
  it.
- The existing `usePaneKeyboard` no longer finds rows to focus because
  they're now inside the virtualizer's scroll element instead of the
  container ref. Update the keyboard hook OR pass the scroll element to
  it.

## Maintenance notes

- The split-table workaround (header in one `<Table>`, body in a
  virtualizer) is the load-bearing layout choice. If anyone later resizes
  columns at runtime, the header and body widths must move in lockstep.
- `file-gallery.tsx` (grid view) needs the same treatment in a follow-up
  plan — apply `useVirtualizer({ … })` with rowHeight calculated from
  the tile size and `lanes` for the columns count.
- Variable row heights would arrive if tag rows expand or if the
  "compact / comfortable / cozy" densities ship — that's a future
  product call. Switch to `measureElement` at that time; cost is one
  resize-observer per visible row.
- React 19's compiler may obviate the explicit `React.memo` once turned
  on. If/when the team enables the compiler in `next.config.ts`, audit
  the manual memoizations and remove redundant ones.
- Reviewer focus: confirm the FileRow callback rename did not regress
  any *non*-FileList consumer of `FileRow` (`grep -rn "FileRow" src`
  before this plan to enumerate; verify each call site after).
