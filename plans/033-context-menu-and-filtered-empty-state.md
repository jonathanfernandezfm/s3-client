# Plan 033: Right-click context menu on file rows + a "clear filter" affordance when a filter matches nothing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/components/browser/file-row.tsx src/components/browser/file-browser.tsx`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (UX)
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

Two small, self-contained UX gaps in the file browser:

1. **No right-click menu.** Every desktop file manager (Finder, Explorer,
   Drive) opens an actions menu on right-click. Here the only way to reach a
   row's actions (Preview, Download, Share, Rename, Copy key, Delete…) is the
   `⋮` button that is `opacity-0` until hover. Right-click is muscle memory; its
   absence is friction. The full menu already exists — we just need to open it
   on `contextmenu`.
2. **Dead-end empty state when filtering.** The in-pane "Filter by name" box and
   the tag filter can reduce the list to zero matches, at which point the list
   renders the generic "This folder is empty" with no hint that a filter is
   active and no inline way to clear it. The clear control lives up in the
   filter bar, spatially separated from where the user is looking.

Both are client-only, no API or data changes, and reuse existing handlers.

## Current state

### File row — the menu and the row element

`src/components/browser/file-row.tsx` (component `FileRowImpl`, memoized as
`FileRow` at line 455):

- Local UI state is declared at lines 130-132:
  ```tsx
  const [shareOpen, setShareOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  ```
- The row root is a `<TableRow>` (lines 189-208) that is already `draggable`,
  spreads `dragHandlers`/`folderDropHandlers`, and has an `onClickCapture` that
  handles shift/ctrl/meta multi-select:
  ```tsx
  <TableRow
    className={cn("group", isSelected && "bg-muted", ...)}
    data-state={isSelected ? "selected" : undefined}
    draggable
    {...dragHandlers}
    {...(folderDropHandlers ?? {})}
    style={{ cursor: "grab" }}
    onClickCapture={(e) => { ... onSelect(...) ... }}
  >
  ```
- The actions menu is an **uncontrolled** Radix dropdown (lines 299-417):
  ```tsx
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="h-8 w-8">
        <MoreVertical className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {/* Preview, Tags, Download, Share, Rename, Properties, Copy key/URI/URL,
          Activity, Versions, Pin, History, Delete — all already here */}
    </DropdownMenuContent>
  </DropdownMenu>
  ```
  `DropdownMenu` / `DropdownMenuTrigger` / `DropdownMenuContent` /
  `DropdownMenuItem` are imported at lines 7-12 from
  `@/components/ui/dropdown-menu` (Radix-based). Radix `DropdownMenu` accepts
  `open` / `onOpenChange` props; when opened programmatically it anchors to its
  `DropdownMenuTrigger`.

### File browser — filter state and the list render

`src/components/browser/file-browser.tsx`:

- Filter state (lines 163-164): `const [activeTag, setActiveTag] = useState<string | null>(null);`
  and `const [nameFilter, setNameFilter] = useState("");`.
- Derived lists (lines 179-184):
  ```tsx
  const visibleObjects = activeTag ? <tag-filtered> : objects;
  const displayedObjects = filterObjectsByName(visibleObjects, nameFilter);
  ```
- The name-filter bar already has a working clear button (lines 622-631,
  `onClick={() => setNameFilter("")}`) and a count badge (lines 633-637).
- The list is rendered at lines 661-709: a `viewMode === "grid"` ternary
  choosing `<FileGallery objects={displayedObjects} ... />` or
  `<FileList objects={displayedObjects} ... />`. Both show their own
  "This folder is empty" placeholder when `objects.length === 0`
  (`file-list.tsx:167-186`).
- `showLoadingOverlay` gates a spinner overlay (line 653); the list wrapper is
  at lines 658-660.

So when `(nameFilter || activeTag)` is set and `displayedObjects.length === 0`,
the user sees "This folder is empty" with no filter context.

Conventions to match: Tailwind utility classes (see existing
`text-muted-foreground`, `text-xs`), `lucide-react` icons (e.g. `X` is already
imported in `file-browser.tsx` — used at line 629), and the `Button` primitive
from `@/components/ui/button`. Keep the memoized `FileRow` cheap — only add a
local boolean state, no new non-primitive props.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | all pass (≥ 670; no regressions) |
| Dev server (manual smoke) | `pnpm dev` | app serves; see manual steps |

## Suggested executor toolkit

- If available, invoke the `web-design-guidelines` skill when writing the empty-
  state markup to keep focus/contrast/keyboard semantics correct.

## Scope

**In scope** (modify only):
- `src/components/browser/file-row.tsx` — make the dropdown controlled, open on
  `onContextMenu`.
- `src/components/browser/file-browser.tsx` — render a filtered-empty block with
  a "Clear filters" button.

**Out of scope** (do NOT touch):
- `src/components/browser/file-gallery.tsx` and `file-list.tsx` — leave their
  generic empty state; the filtered-empty case is handled one level up in
  `file-browser.tsx`, so these stay unchanged. (Do not also add an affordance
  inside them — that would double-render.)
- Adding `@radix-ui/react-context-menu` or any new dependency — the controlled
  `DropdownMenu` approach below needs no new package. Do NOT add one.
- The drag/drop handlers, selection logic, or `onClickCapture` on the row.
- The menu's items — do not add/remove/reorder them; you only change how the
  menu opens.

## Git workflow

- Shared checkout — run `git branch --show-current` before committing.
- Branch: `feat/033-context-menu-and-empty-state`.
- Commits: `feat: open the file-row actions menu on right-click` and
  `feat: offer clear-filter when a browser filter matches nothing`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Make the row's dropdown controlled

In `file-row.tsx`, add a local open state alongside the others (near line 132):

```tsx
const [menuOpen, setMenuOpen] = useState(false);
```

Change the dropdown root (line 299) to controlled:

```tsx
<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
```

Leave the `DropdownMenuTrigger`, the `⋮` button, and all items unchanged.

**Verify**: `pnpm typecheck` → exit 0. Behaviour is unchanged so far (clicking
`⋮` still opens/closes the menu).

### Step 2: Open the menu on right-click

Add an `onContextMenu` handler to the `<TableRow>` (the root element, lines
189-208). It must prevent the browser's native menu and open the row menu:

```tsx
onContextMenu={(e) => {
  e.preventDefault();
  setMenuOpen(true);
}}
```

Place it as a sibling of the existing `onClickCapture`/`draggable` props. Do not
remove or alter the existing props.

The menu will anchor to the `⋮` `DropdownMenuTrigger` (right side of the row),
which is acceptable and consistent. (Cursor-anchored positioning would require a
new dependency, which is out of scope.)

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 3: Render a filtered-empty affordance in the browser

In `file-browser.tsx`, define a single clear-all-filters handler near the filter
state (after line 164):

```tsx
const filtersActive = nameFilter.trim() !== "" || activeTag !== null;
const clearFilters = () => { setNameFilter(""); setActiveTag(null); };
```

Then wrap the list render (the `paneState.viewMode === "grid" ? <FileGallery/> :
<FileList/>` ternary at lines 661-709) so that, when a filter is active and
there are zero matches and we're not loading, you show the affordance instead:

```tsx
{filtersActive && displayedObjects.length === 0 && !showLoadingOverlay ? (
  <div className="flex flex-col items-center justify-center flex-1 min-h-[200px] py-12 text-center gap-3">
    <p className="text-sm text-muted-foreground">
      No files match your filter{nameFilter ? ` “${nameFilter}”` : ""}.
    </p>
    <Button variant="outline" size="sm" className="text-xs" onClick={clearFilters}>
      <X className="size-3" />
      Clear filters
    </Button>
  </div>
) : (
  paneState.viewMode === "grid" ? (
    <FileGallery objects={displayedObjects} /* ...unchanged props... */ />
  ) : (
    <FileList objects={displayedObjects} /* ...unchanged props... */ />
  )
)}
```

Keep every prop passed to `FileGallery`/`FileList` exactly as it is today — only
the surrounding conditional is new. `X` and `Button` are already imported in
this file (X at the filter bar, Button elsewhere); confirm both imports exist
and add nothing else.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 4: Manual smoke test

Run `pnpm dev`, open a bucket with at least a few objects, and confirm:

1. **Right-click a file row** → the actions menu opens (same items as the `⋮`
   button). Right-click a folder row → its menu opens. The browser's native
   context menu does NOT appear.
2. Left-click `⋮` still opens/closes the menu as before; selecting an item still
   works (e.g. Copy key shows the "Key copied" notification).
3. Type a filter string in "Filter by name…" that matches nothing → the list
   area shows "No files match your filter “…”." with a **Clear filters** button;
   clicking it empties the filter and restores the list.
4. Apply a tag filter that (combined) matches nothing → same affordance; Clear
   filters removes both the name and tag filter.
5. With NO filter active, an genuinely empty folder still shows the original
   "This folder is empty" (the new block must not hijack the unfiltered empty
   case).

**Verify**: all five behaviors observed. Note any deviation in your report.

### Step 5: Full gate

**Verify**: `pnpm test` (all pass — no component test is required for this UI
change, but the suite must stay green), `pnpm typecheck` (exit 0), `pnpm lint`
(exit 0).

## Test plan

- These are interaction/visual changes; the repo has no component-interaction
  test harness for the browser surface, so verification is the manual smoke in
  Step 4 plus a green `pnpm test`/`typecheck`/`lint`.
- If (and only if) a `file-row` or `file-browser` test already exists under
  `src/components/browser/*.test.tsx`, add a case asserting `onContextMenu`
  preventDefault opens the menu and/or the filtered-empty branch renders the
  Clear button. Do NOT stand up a new RTL harness from scratch for this plan.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 (no regressions)
- [ ] `grep -n "onContextMenu" src/components/browser/file-row.tsx` shows the new
      handler; `grep -n "open={menuOpen}" src/components/browser/file-row.tsx`
      shows the controlled dropdown
- [ ] `grep -n "Clear filters" src/components/browser/file-browser.tsx` shows the
      new affordance
- [ ] `file-gallery.tsx` and `file-list.tsx` are unmodified (`git status`)
- [ ] Manual smoke (Step 4) all five behaviors pass
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The dropdown in `file-row.tsx` is no longer a Radix `DropdownMenu` accepting
  `open`/`onOpenChange` (e.g. it was replaced) — the controlled approach won't
  apply.
- Opening the menu via `setMenuOpen(true)` does not position it (renders at the
  page origin or not at all) on the installed Radix version — if so, STOP and
  report; the fallback (adding `@radix-ui/react-context-menu`) is a separate,
  larger change that needs sign-off, not an improvisation here.
- `file-browser.tsx` no longer derives `displayedObjects` from `nameFilter` +
  `activeTag` as excerpted (the filter pipeline was refactored).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The context menu deliberately reuses the single existing menu definition, so
  it can never drift from the `⋮` menu — that's the reason for the controlled-
  dropdown approach over a separate `ContextMenu` component. If a future
  requirement needs cursor-anchored positioning or a *different* set of items
  for right-click, that justifies adding `@radix-ui/react-context-menu` and
  extracting the items into a shared component — note it then.
- The filtered-empty block lives in `file-browser.tsx` (where filter state
  lives), NOT in `FileList`/`FileGallery`. If those components are ever made the
  owners of filter state, move the affordance with it to avoid a double empty
  state.
- Reviewer should check that the unfiltered empty folder still shows the
  original placeholder (the `filtersActive` guard), and that `FileRow`'s memo
  benefit isn't lost (only a local `useState` was added — no new props).
