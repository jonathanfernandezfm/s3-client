# Plan 037: Make the app sidebar accessible (aria-current, aria-expanded, landmark label, keyboard bookmark reorder, icon-button names)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/components/shared/app-sidebar.tsx`
> If it changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (sole file is `app-sidebar.tsx`; no overlap with other plans)
- **Category**: direction (accessibility / navigation)
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

The sidebar is the app's primary navigation, but it communicates state only
visually:

1. **Active page** is shown with background color + bold text but no
   `aria-current` — screen-reader users can't tell which nav item is the current
   page.
2. **Workspace collapse toggles** swap a chevron icon but expose no
   `aria-expanded`, so assistive tech can't announce expanded/collapsed state.
3. The **`<aside>` landmark is unlabeled**, so landmark navigation just says
   "complementary" with no name.
4. **Pinned-bucket reorder is pointer-only** — `dnd-kit` is configured with only
   `PointerSensor`, so keyboard and motor-impaired users cannot reorder pins.
   `dnd-kit` ships a `KeyboardSensor` that adds this for free.
5. A couple of **icon-only controls** (the connection `⋮` menu trigger, and the
   team "+" add menu) lack accessible names.

All fixes are additive attributes/props on one file. No behavior changes for
mouse users.

## Current state

`src/components/shared/app-sidebar.tsx`:

- dnd-kit imports (lines 53-61) include `PointerSensor` but **not**
  `KeyboardSensor`. Sensors (lines 133-135):
  ```tsx
  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  }));
  ```
- `SortableContext` uses `verticalListSortingStrategy` (line 305) — the strategy
  `KeyboardSensor`'s default coordinate-getter expects.
- The `<aside>` (line 234) has no `aria-label`:
  ```tsx
  <aside className="w-64 border-r bg-sidebar-background min-h-screen flex flex-col">
  ```
- Top-level nav links compute active state into booleans (`isBucketsActive`,
  `isConnectionsActive`, `isSharesActive`, `isSettingsActive`, `isBillingActive`,
  etc., lines 165-175) and apply it as classes only. Example (lines 247-259):
  ```tsx
  <Link href="/app/buckets" onClick={handleBucketsClick}
    className={cn("flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
      isBucketsActive ? "bg-sidebar-accent ... font-medium" : "...")}>
    <Database className="h-4 w-4" />
    Buckets
  </Link>
  ```
  The same shape repeats for Connections (261-272), Shares (274-290), Settings
  (482-493), Billing (494-505). Per-connection links compute `isConnActive`
  (lines 399-401) and apply classes (lines 404-420).
- The workspace collapse button (lines 339-355) toggles `collapsedWorkspaces`
  but has no `aria-expanded`:
  ```tsx
  <button type="button" onClick={() => toggleWorkspace(workspace.id)}
    className="flex items-center gap-2 flex-1 ...">
    {isCollapsed ? <ChevronRight .../> : <ChevronDown .../>}
    ...
    <span className="truncate">{workspace.name}</span>
  </button>
  ```
  `isCollapsed` is read at line 333: `const isCollapsed = collapsedWorkspaces[workspace.id];`
- Icon-only controls lacking names:
  - The TEAM workspace "+" `DropdownMenuTrigger` Button (lines 360-367) has
    `title="Add to team"` but no `aria-label`.
  - The connection `⋮` `DropdownMenuTrigger` Button (lines 424-430) has neither
    `title` nor `aria-label`.

Conventions to match:
- `aria-current="page"` is the correct value for the current navigation link.
- Active links: add the attribute conditionally, e.g.
  `aria-current={isBucketsActive ? "page" : undefined}`.
- For icon-only buttons, add `aria-label="…"` directly on the `Button`
  (the repo's `Button` forwards arbitrary props to the underlying element).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | all pass (no regressions) |
| Dev (manual smoke) | `pnpm dev` | app serves; see Step 5 |

## Suggested executor toolkit

- If available, invoke `web-design-guidelines` to confirm the `aria-current` /
  `aria-expanded` usage and the dnd keyboard pattern.

## Scope

**In scope** (modify only):
- `src/components/shared/app-sidebar.tsx`

**Out of scope** (do NOT touch):
- `src/app/app/layout.tsx` — the skip link / route focus is plan 036.
- The `useSidebarStore` / `useLayoutStore` stores — only consume them as today.
- The DnD reorder *logic* (`handleDragStart`/`handleDragEnd`) — only add the
  sensor; do not change reorder behavior.
- The edit/delete `Dialog`s at the bottom of the file — they use Radix `Dialog`
  and already have `DialogTitle`s; leave them.

## Git workflow

- Shared checkout — run `git branch --show-current` before committing.
- Branch: `feat/037-sidebar-a11y`.
- Commit: `feat(a11y): aria-current, aria-expanded, landmark label, keyboard reorder in sidebar`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the KeyboardSensor for bookmark reorder

In the dnd-kit `@dnd-kit/core` import block (lines 53-61), add `KeyboardSensor`.
In the `@dnd-kit/sortable` import block (lines 62-67), add
`sortableKeyboardCoordinates`. Then change the sensors (lines 133-135) to:

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);
```

`sortableKeyboardCoordinates` is exported from `@dnd-kit/sortable` and is the
standard coordinate-getter for `verticalListSortingStrategy`.

**Verify**: `pnpm typecheck` → exit 0 (confirms both symbols exist in the
installed `@dnd-kit` version).

### Step 2: Make the drag handle keyboard-reachable

The pinned item's drag listeners are spread on a `<span>` (lines 104-107) that
is not focusable. For keyboard drag to start, the element carrying the dnd
`listeners`/`attributes` must be focusable. `dnd-kit`'s `attributes` already
include `role="button"` and `tabIndex={0}` — but they are currently applied to a
`<span>`. Confirm the spread `{...listeners} {...attributes}` is on an element
that renders those attributes (a `<span>` will accept them). If keyboard drag
does not initiate in Step 5, this is the likely cause — see STOP conditions.

No code change is required in this step unless Step 5 reveals the handle is not
focusable; if so, STOP and report rather than restructuring the row.

**Verify**: `pnpm typecheck` → exit 0 (no change expected).

### Step 3: Add aria-current to active nav links

For each top-level nav `<Link>` that has an `isXActive` boolean, add
`aria-current={isXActive ? "page" : undefined}` as a prop:

- Buckets link (line ~247): `aria-current={isBucketsActive ? "page" : undefined}`
- Connections link (line ~261): `aria-current={isConnectionsActive ? "page" : undefined}`
- Shares link (line ~274): `aria-current={isSharesActive ? "page" : undefined}`
- Settings link (line ~482): `aria-current={isSettingsActive && !isBillingActive ? "page" : undefined}`
- Billing link (line ~494): `aria-current={isBillingActive ? "page" : undefined}`
- Per-connection link (line ~412, inside the `workspaceConns.map`): the active
  boolean is `isConnActive` (line 399) — add
  `aria-current={isConnActive ? "page" : undefined}` to that `<Link>`.

**Verify**: `pnpm typecheck` → exit 0;
`grep -c 'aria-current' src/components/shared/app-sidebar.tsx` → at least 6.

### Step 4: Add aria-expanded to workspace toggles + label landmarks + name icon buttons

1. Workspace toggle button (line ~339): add `aria-expanded={!isCollapsed}`.
2. `<aside>` (line 234): add `aria-label="Sidebar"`.
3. The TEAM "+" trigger Button (lines 360-367): add `aria-label="Add to team"`
   (it already has a matching `title`).
4. The connection `⋮` trigger Button (lines 424-430): add
   `aria-label="Connection options"`.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0;
`grep -n 'aria-expanded' src/components/shared/app-sidebar.tsx` shows the toggle.

### Step 5: Manual smoke test

Run `pnpm dev`:

1. With a screen reader (or by inspecting the DOM in devtools), confirm the
   active sidebar link carries `aria-current="page"` and inactive ones do not.
2. Collapse/expand a workspace — the toggle button's `aria-expanded` flips
   between `true`/`false` in the DOM.
3. **Keyboard reorder**: Tab to a pinned bucket's drag handle (the icon area),
   press **Space** to pick it up, **Arrow Up/Down** to move it, **Space** to
   drop. The order persists (a reorder request fires). Mouse drag still works.
4. The connection `⋮` and team "+" buttons expose an accessible name (devtools
   Accessibility pane shows the label).

**Verify**: all four behaviors observed. Report any deviation.

### Step 6: Full gate

**Verify**: `pnpm test` (all pass), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0).

## Test plan

- No DOM-interaction harness exists for the sidebar; verification is the Step 5
  manual smoke plus a green `pnpm test`/`typecheck`/`lint`. Do NOT build a new
  harness. State in your report which path you took.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 (no regressions)
- [ ] `grep -n "KeyboardSensor" src/components/shared/app-sidebar.tsx` shows the sensor
- [ ] `grep -c "aria-current" src/components/shared/app-sidebar.tsx` ≥ 6
- [ ] `grep -n "aria-expanded" src/components/shared/app-sidebar.tsx` shows the workspace toggle
- [ ] `grep -n 'aria-label="Sidebar"' src/components/shared/app-sidebar.tsx` shows the landmark label
- [ ] Manual smoke (Step 5) all four behaviors pass (esp. keyboard reorder)
- [ ] No files outside `app-sidebar.tsx` are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `KeyboardSensor` or `sortableKeyboardCoordinates` is not exported by the
  installed `@dnd-kit/core` / `@dnd-kit/sortable` (typecheck error) — report; do
  not hand-roll keyboard dragging.
- Keyboard reorder picks up the item but moving/dropping throws or corrupts the
  pin order — STOP; the `handleDragEnd` index math may need a different sensor
  config; report rather than rewriting reorder logic.
- The active-state booleans (`isBucketsActive`, etc.) are no longer computed as
  excerpted (sidebar refactored) — re-derive before adding `aria-current`.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If a new top-level nav item is added, add its `aria-current` alongside its
  active-class logic (same pattern).
- The drag handle keyboard path depends on `dnd-kit`'s `attributes` including
  `tabIndex`/`role`; if the pin row markup is refactored, keep `{...attributes}`
  on a focusable element or keyboard reorder silently breaks.
- Reviewer should scrutinize: that `aria-current` is `undefined` (not `false`)
  when inactive (so the attribute is omitted), and that keyboard reorder fires
  the same `reorderBookmarks.mutate` as mouse drag.
- Coordinates with plan 036 (skip link / route focus) only by sharing the app
  shell conceptually — different files, no merge conflict.
