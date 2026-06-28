# Plan 058: Accessible names for icon-only buttons (round 2)

> Drift check (run first): `git diff --stat e9ad3b3..HEAD -- src/components/preview/renderers/image-preview.tsx src/components/browser/file-row.tsx src/components/browser/file-tile.tsx src/components/connections/connection-list.tsx src/components/info-drawer/notes-tab.tsx` — if any of these changed since e9ad3b3, compare the "Current state" excerpts below against live code before proceeding; on mismatch, STOP.

## Status
- Priority: P2 | Effort: S | Risk: LOW | Depends on: none | Category: a11y
- Planned at: commit e9ad3b3, 2026-06-27

## Why this matters
The app is live. A prior a11y pass (plans 036–042) added accessible names to icon buttons in the bucket grid and pane tab bar, but several high-traffic icon-only buttons elsewhere still announce nothing to screen readers and give no tooltip to sighted mouse users. This closes those remaining gaps with `aria-label` attributes — zero behavior change, pure accessibility.

## Current state (verbatim excerpts)
All these are icon-only `<Button>`/`<DropdownMenuTrigger>` buttons whose only child is a Lucide icon, with NO `aria-label` (and in most cases no `title`):

- `src/components/preview/renderers/image-preview.tsx:20-27` — ZoomOut button (`<ZoomOut/>`), and `:31-38` — ZoomIn button (`<ZoomIn/>`). No aria-label.
- `src/components/browser/file-row.tsx:294-303` — Properties button has `title="Properties"` but no `aria-label`; `:320-322` — the `<MoreVertical/>` dropdown trigger has neither title nor aria-label.
- `src/components/browser/file-tile.tsx:209-216` — `<MoreVertical/>` dropdown trigger, no aria-label.
- `src/components/connections/connection-list.tsx:204-213` — Settings link button (`<Settings/>`, rendered `asChild` wrapping a `<Link>`), no aria-label; `:217-223` — `<MoreVertical/>` dropdown trigger, no aria-label.
- `src/components/info-drawer/notes-tab.tsx:104-106` — `<MoreVertical/>` dropdown trigger, no aria-label.

Convention to match: the existing codebase adds `aria-label="..."` directly on the `<Button>` element (see plan 042's pattern). For `asChild` buttons that wrap a `<Link>`, put `aria-label` on the `<Link>` (the rendered element), not the Button.

## Scope
In scope (modify ONLY these):
- `src/components/preview/renderers/image-preview.tsx`
- `src/components/browser/file-row.tsx`
- `src/components/browser/file-tile.tsx`
- `src/components/connections/connection-list.tsx`
- `src/components/info-drawer/notes-tab.tsx`
Plus the plan/index/changelog files named in the execution tasks.

Out of scope: any logic change, any other component, the bucket-grid/pane-tab buttons (already done in plan 042).

## Steps
### Step 1: image-preview.tsx
Add `aria-label="Zoom out"` to the ZoomOut button and `aria-label="Zoom in"` to the ZoomIn button.

### Step 2: file-row.tsx
Add `aria-label="File properties"` to the Properties button (keep the existing `title="Properties"`). Add `aria-label="More actions"` to the `<MoreVertical/>` dropdown trigger Button at ~line 320. (Leave the alternate `contextPos` `<span>` trigger untouched — it is not a button.)

### Step 3: file-tile.tsx
Add `aria-label="File options"` to the `<MoreVertical/>` dropdown trigger Button at ~line 209.

### Step 4: connection-list.tsx
Add `aria-label="Connection settings"` to the `<Link>` inside the Settings Button (the rendered element), and `aria-label="More connection options"` to the `<MoreVertical/>` dropdown trigger Button.

### Step 5: notes-tab.tsx
Add `aria-label="Note options"` to the `<MoreVertical/>` dropdown trigger Button at ~line 104.

**Verify after all steps**: `pnpm install` (exit 0) → `pnpm typecheck` (exit 0) → `pnpm lint` (exit 0) → `pnpm test` (all pass). Then `git grep -n "aria-label" src/components/preview/renderers/image-preview.tsx` shows 2 matches.

## Done criteria (ALL must hold)
- [ ] Each of the 5 files has the aria-labels described above
- [ ] `pnpm typecheck` exits 0, `pnpm lint` exits 0, `pnpm test` passes
- [ ] No files outside scope modified (besides plan/index/changelog)
- [ ] PR opened

## STOP conditions
- Live code at any cited location does not match the excerpts (drift) → STOP and report.
- A verification fails twice after a reasonable fix → STOP and report.
- A button at a cited line already has an `aria-label` → note it, skip that one, continue.

## Maintenance notes
Future icon-only buttons should follow this same `aria-label` convention. Reviewer should confirm no visual/behavioral change — only attribute additions.
