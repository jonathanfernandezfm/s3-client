# Plan 042: Add accessible names to icon-only buttons in the bucket grid and pane tab bar

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/components/buckets/bucket-card.tsx src/components/tabs/tab-bar.tsx`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (accessibility)
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

Several icon-only buttons on high-traffic surfaces convey their purpose only via
a `title` tooltip (or nothing at all). `title` is not a reliable accessible name
— many screen readers don't announce it, and it never appears for keyboard-only
users. A screen-reader user navigating the bucket grid or the pane tab bar hears
"button" with no indication of what it does (pin, options, new tab, split, close).
Adding `aria-label` is a one-attribute, zero-risk fix per button. This plan
covers the two surfaces verified to have unnamed icon buttons; other surfaces are
handled by their own plans (sidebar → 037, breadcrumb → 038, drawers → 040,
notifications → 041).

## Current state

`src/components/buckets/bucket-card.tsx`:
- Pin/unpin button (lines 76-91) — icon-only, has `title={pinned ? "Unpin" : "Pin"}`
  but no `aria-label`:
  ```tsx
  <button onClick={...} className="..." title={pinned ? "Unpin" : "Pin"}>
    <Star className="size-4" fill={pinned ? "currentColor" : "none"} />
  </button>
  ```
- The `⋮` options menu trigger (lines 92-97) — icon-only, **no** `title` or
  `aria-label`:
  ```tsx
  <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
    <Button variant="ghost" size="icon" className="h-8 w-8">
      <MoreVertical className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  ```

`src/components/tabs/tab-bar.tsx`:
- The per-tab close button (lines 112-125) — icon-only, no name:
  ```tsx
  <button className="..." onClick={(e) => { e.stopPropagation(); removeTab(paneId, tab.id); }}>
    <X className="h-3.5 w-3.5" />
  </button>
  ```
- The "New tab" `Button` (lines 174-182) — has `title="New tab"`, no `aria-label`.
- The "Split right" `Button` (lines 187-195) — has `title="Split right"`, no `aria-label`.
- The "Close pane" `Button` (lines 197-207) — has `title="Close pane"`, no `aria-label`.

Conventions to match:
- The `Button` primitive (`src/components/ui/button.tsx`) forwards arbitrary
  props (including `aria-label`) to the underlying `<button>`.
- For the per-tab close button, a dynamic label that includes the tab name is
  nicer; the label text is available from the existing `getTabLabel()` helper
  (lines 65-74) inside `TabItem`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | all pass (no regressions) |
| Dev (manual smoke) | `pnpm dev` | app serves; see Step 3 |

## Suggested executor toolkit

- If available, invoke `web-design-guidelines` to confirm icon-button naming
  (`aria-label` over `title`).

## Scope

**In scope** (modify only):
- `src/components/buckets/bucket-card.tsx`
- `src/components/tabs/tab-bar.tsx`

**Out of scope** (do NOT touch):
- `src/components/browser/file-row.tsx` / `file-list.tsx` / `file-tile.tsx` —
  file-row/file-list are owned by plans 033/034; do not edit them here.
- The tab **selection/close/drag behavior** in `tab-bar.tsx` — only add labels.
  Do NOT attempt to make the `<div>`-based tabs keyboard-operable here; that's a
  separate deferred item (see README) with real drag/drop risk.
- The dropdown menu items' content — only the trigger button gets a label.

## Git workflow

- Shared checkout — run `git branch --show-current` before committing.
- Branch: `feat/042-icon-button-names`.
- Commit: `feat(a11y): accessible names for bucket-card and tab-bar icon buttons`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Label the bucket-card buttons

In `bucket-card.tsx`:
- Pin button (line ~76): add `aria-label={pinned ? "Unpin bucket" : "Pin bucket"}`
  (keep the existing `title`).
- `⋮` options trigger `Button` (line ~94): add `aria-label="Bucket options"`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Label the tab-bar buttons

In `tab-bar.tsx`:
- Per-tab close button (line ~113): add a dynamic label using the existing tab
  label, e.g. `aria-label={`Close tab ${getTabLabel()}`}` (the `getTabLabel`
  helper is in scope inside `TabItem`).
- "New tab" `Button` (line ~174): add `aria-label="New tab"` (keep `title`).
- "Split right" `Button` (line ~187): add `aria-label="Split pane right"` (keep `title`).
- "Close pane" `Button` (line ~197): add `aria-label="Close pane"` (keep `title`).

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 3: Manual smoke test

Run `pnpm dev`:

1. In the bucket grid, inspect the pin and `⋮` buttons in the devtools
   Accessibility pane — each reports an accessible name; clicking still
   pins/unpins and opens the menu.
2. In a browser pane with ≥2 tabs, inspect the tab close (X), New tab, Split
   right, and Close pane buttons — each reports an accessible name; all still
   function (close tab, add tab, split, close pane).

**Verify**: both behaviors observed. Report any deviation.

### Step 4: Full gate

**Verify**: `pnpm test` (all pass), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0).

## Test plan

- No DOM-interaction harness exists for these surfaces; verification is the
  Step 3 manual smoke plus a green `pnpm test`/`typecheck`/`lint`. Do NOT build a
  new harness. State which path you took in your report.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 (no regressions)
- [ ] `grep -c "aria-label" src/components/buckets/bucket-card.tsx` ≥ 2
- [ ] `grep -c "aria-label" src/components/tabs/tab-bar.tsx` ≥ 4
- [ ] No files outside the two in-scope files are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `getTabLabel()` is no longer in scope where the close button is rendered
  (the component was restructured) — use a static `aria-label="Close tab"`
  instead and note it.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Deferred (separate plan)**: the tab-bar tabs themselves are `<div onClick>`
  elements (line ~84) — not focusable or keyboard-operable. Making them real
  buttons/tabs with keyboard support is a larger change entangled with the
  drag-to-reorder and pane-focus logic; it is recorded as a deferred item in
  `plans/README.md`, NOT part of this label-only plan.
- When adding any new icon-only button to these files, give it an `aria-label`.
- Reviewer should scrutinize that labels are on the interactive element (the
  `<button>`/`Button`), not a wrapper, and that no behavior changed.
