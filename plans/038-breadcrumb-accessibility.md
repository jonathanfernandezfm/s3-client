# Plan 038: Give the file-browser breadcrumb proper navigation semantics and accessible names

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/components/browser/breadcrumb.tsx`
> If it changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (sole file is `breadcrumb.tsx`)
- **Category**: direction (accessibility / navigation)
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

The breadcrumb is the user's primary wayfinding control inside a bucket, but it
is not exposed as a breadcrumb to assistive tech:

- The wrapping `<nav>` has **no `aria-label`**, so a screen reader announces a
  generic, unnamed navigation region.
- Crumbs are laid out as bare inline `<Link>`/`<div>` elements with no list
  structure (`<ol>`/`<li>`), losing the "this is an ordered path" semantics.
- The current (last) crumb has no `aria-current="page"`.
- Several icon-only controls (Home, bucket Settings cog, Pin, Copy-URI) convey
  meaning only through a `title` attribute, which is not a reliable accessible
  name.

These are additive markup/attribute changes; the layout and click behavior stay
the same.

## Current state

`src/components/browser/breadcrumb.tsx` renders (lines 101-211, abbreviated):

```tsx
<div className="flex items-center gap-1.5 min-w-0">
  <nav className="flex items-center text-sm min-w-0 overflow-hidden">
    <Link href="/app/buckets" ... onClick={handleHomeClick} title="Back to buckets">
      <Home className="h-4 w-4" />
    </Link>
    <ChevronRight ... />
    <Link href={`/app/browser/${connectionId}/${bucket}`} ... title={bucket}>
      {bucket}
    </Link>
    <Link href={`/app/buckets/${connectionId}/${encodeURIComponent(bucket)}?tab=overview`}
      ... title="Bucket settings" onClick={(e) => e.stopPropagation()}>
      <Settings className="h-3.5 w-3.5" />
    </Link>
    {shouldCollapse && ( <> ...ellipsis + last crumbs... </> )}
    {!shouldCollapse && parts.map((part, index) => (
      <div key={index} className="flex items-center min-w-0">
        <ChevronRight ... />
        <Link href={buildHref(index)}
          className={`... ${index === parts.length - 1 ? "font-medium" : "text-muted-foreground"}`}
          onClick={(e) => handleClick(e, buildPath(index))} title={part}>
          {part}
        </Link>
      </div>
    ))}
  </nav>
  {currentPrefix && (
    <button onClick={...} className="..." title={folderPinned ? "Unpin current folder" : "Pin current folder"}>
      <Star className="size-3.5" ... />
    </button>
  )}
  <button onClick={handleCopyPath} className="..." title="Copy S3 URI">
    {copied ? <Check .../> : <Copy .../>}
  </button>
</div>
```

Key facts:
- `parts = path.split("/").filter(Boolean)` (line 30) is the ordered path
  segments. The **last** visible crumb is the current location.
- There are two rendering branches: `shouldCollapse` (deep paths, with an
  ellipsis button, lines 135-171) and the non-collapsed branch (lines 173-188).
- The Home link, Settings cog, ellipsis button (`title="Go to parent folder"`,
  line 151), Pin button, and Copy button are all icon-only with only `title`.
- `aria-current` is the standard way to mark the current crumb; the last segment
  is detectable via `index === parts.length - 1` (non-collapsed) and
  `originalIndex === parts.length - 1` (collapsed branch, line 161).

Conventions to match:
- Tailwind utility classes throughout; `lucide-react` icons.
- Keep the existing `className` strings on each element; only add attributes and
  the list wrappers.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | all pass (no regressions) |
| Dev (manual smoke) | `pnpm dev` | app serves; see Step 4 |

## Suggested executor toolkit

- If available, invoke `web-design-guidelines` for the breadcrumb ARIA pattern
  (nav label, ordered list, `aria-current="page"`).

## Scope

**In scope** (modify only):
- `src/components/browser/breadcrumb.tsx`

**Out of scope** (do NOT touch):
- The navigation handlers (`handleClick`, `handleHomeClick`,
  `handleEllipsisClick`, `handleCopyPath`) — behavior is unchanged.
- The collapse/`maxVisibleItems` logic — do not change when/how crumbs collapse.
- `file-browser.tsx` or any consumer of `Breadcrumb`.

## Git workflow

- Shared checkout — run `git branch --show-current` before committing.
- Branch: `feat/038-breadcrumb-a11y`.
- Commit: `feat(a11y): breadcrumb nav label, ordered-list semantics, aria-current, button labels`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Label the breadcrumb nav

Change the `<nav>` (line 103) to:
```tsx
<nav aria-label="Breadcrumb" className="flex items-center text-sm min-w-0 overflow-hidden">
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Add aria-current to the current (last) crumb

Mark the current location for assistive tech without changing the visual
"font-medium" treatment:

- Non-collapsed branch (line ~177 `<Link>`): add
  `aria-current={index === parts.length - 1 ? "page" : undefined}`.
- Collapsed branch's mapped crumbs (line ~158 `<Link>`): add
  `aria-current={originalIndex === parts.length - 1 ? "page" : undefined}`.
- The bucket-root `<Link>` (line ~115): when `parts.length === 0` the bucket is
  the current location — add `aria-current={parts.length === 0 ? "page" : undefined}`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Name the icon-only controls

Add `aria-label` to each icon-only control (keep their existing `title`):

- Home link (line ~104): `aria-label="Back to buckets"`.
- Bucket Settings cog link (line ~126): `aria-label="Bucket settings"`.
- Ellipsis button (line ~148): `aria-label="Go to parent folder"`.
- Pin button (line ~191): keep it dynamic —
  `aria-label={folderPinned ? "Unpin current folder" : "Pin current folder"}`.
- Copy button (line ~202): `aria-label="Copy S3 URI"`.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 4: Wrap the crumb sequence in an ordered list (semantics)

Convert the crumb trail to a proper `<ol>`/`<li>` structure so the path reads as
an ordered list. This is the only structural change; do it carefully and keep
every existing class and the two branches intact.

Target shape inside the `<nav>`:
```tsx
<nav aria-label="Breadcrumb" className="...">
  <ol className="flex items-center min-w-0 overflow-hidden">
    <li className="flex items-center shrink-0">{/* Home link */}</li>
    <li className="flex items-center min-w-0">{/* ChevronRight + bucket link + settings cog */}</li>
    {shouldCollapse && ( <> {/* each crumb as its own <li> */} </> )}
    {!shouldCollapse && parts.map(... => (
      <li key={index} className="flex items-center min-w-0">{/* ChevronRight + link */}</li>
    ))}
  </ol>
</nav>
```

Notes:
- Replace the existing wrapping `<div key={...} className="flex items-center min-w-0">`
  around each mapped crumb with `<li key={...} className="flex items-center min-w-0">`.
- Group the separators (`<ChevronRight>`) with the crumb they precede, inside the
  same `<li>`, so the list has one `<li>` per crumb.
- The Pin and Copy buttons stay OUTSIDE the `<nav>`/`<ol>` (they are actions, not
  path items) — leave them where they are in the outer `<div>`.
- `<ol>` has a default list style; the `flex` utilities already neutralize
  markers visually, but add `list-none` to the `<ol>` className if any bullet/
  number appears.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 5: Manual smoke test

Run `pnpm dev`, open a bucket and navigate into nested folders:

1. The breadcrumb still renders identically (Home, bucket, cog, crumbs, pin,
   copy) at shallow and deep (collapsed) paths — no visible bullets/numbers, no
   layout shift.
2. In devtools Accessibility pane (or a screen reader): the region is named
   "Breadcrumb", the crumbs are an ordered list, and the last crumb has
   `aria-current="page"`.
3. Each icon button (Home, cog, ellipsis, pin, copy) exposes an accessible name.
4. Clicking crumbs/Home/ellipsis/pin/copy behaves exactly as before.

**Verify**: all four behaviors observed. Report any deviation.

### Step 6: Full gate

**Verify**: `pnpm test` (all pass), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0).

## Test plan

- No DOM-interaction harness exists for the breadcrumb; verification is the
  Step 5 manual smoke plus a green `pnpm test`/`typecheck`/`lint`. Do NOT build a
  new harness. State which path you took in your report.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 (no regressions)
- [ ] `grep -n 'aria-label="Breadcrumb"' src/components/browser/breadcrumb.tsx` shows the nav label
- [ ] `grep -c "aria-current" src/components/browser/breadcrumb.tsx` ≥ 2
- [ ] `grep -n "<ol" src/components/browser/breadcrumb.tsx` shows the ordered list
- [ ] Manual smoke (Step 5) all four behaviors pass
- [ ] No files outside `breadcrumb.tsx` are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The two render branches (`shouldCollapse` true/false) are no longer present as
  excerpted — the `<li>` wrapping must follow whatever structure exists; report
  on a mismatch.
- Wrapping in `<ol>`/`<li>` shifts the layout or introduces list markers that
  `list-none` doesn't remove — report; do not abandon the list semantics by
  reverting to `<div>`s without flagging it.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If a future change adds a new icon control to the breadcrumb, give it an
  `aria-label`, and decide whether it's a path item (goes in the `<ol>`) or an
  action (stays outside the `<nav>`).
- Reviewer should scrutinize: exactly one `<li>` per crumb, separators don't
  create empty list items, and `aria-current` lands on the *current* crumb in
  both the collapsed and non-collapsed branches.
- The deep-path ellipsis currently jumps to the parent folder (not a menu of
  hidden crumbs). Turning it into a menu of the skipped levels is a deferred
  UX enhancement (recorded in `plans/README.md`), not part of this plan.
