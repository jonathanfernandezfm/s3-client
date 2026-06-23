# Plan 036: Add a skip-to-content link, label app-shell landmarks, and move focus to main on client navigation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/app/app/layout.tsx src/components/shared/app-sidebar.tsx`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (independent of all other 036–042 a11y plans — touches only `layout.tsx` + two new files; plan 037 touches `app-sidebar.tsx` for a one-attribute `aria-label` — see Maintenance notes)
- **Category**: direction (accessibility / navigation)
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

The dashboard renders the sidebar first in the DOM, then the main content. A
keyboard-only user landing on any page must Tab through every sidebar link
(Buckets, Connections, Shares, pinned buckets, every workspace + connection,
Settings, Billing) before reaching the content they came for — on every page,
every time. There is no "skip to main content" link, the standard remedy. In
addition, Next.js App Router does **not** move keyboard focus when the route
changes on the client, so after a screen-reader/keyboard user navigates, focus
is stranded (often at the top of the document or wherever it was), with no
announcement of the new page. This plan adds the three standard fixes: a skip
link, a labeled focusable `<main>`, and focus-move-to-main on navigation.

## Current state

`src/app/app/layout.tsx` (the dashboard shell — a **server component**, no
`"use client"`):

```tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
    <DragProvider>
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
        </div>
      </div>
      <InfoDrawer />
      ...
    </DragProvider>
    </TooltipProvider>
  );
}
```

- `<main>` exists (line 25) but has **no `id`** (so a skip link has no target)
  and is **not programmatically focusable** (no `tabIndex`).
- The layout is a server component. A skip-link is a plain `<a>` and is fine
  here, but anything using hooks (`usePathname`) must live in a separate
  `"use client"` component.

Conventions to match:
- `sr-only` (Tailwind's visually-hidden utility) is already used in this repo —
  see `src/components/ui/dialog.tsx:52` (`<span className="sr-only">Close</span>`).
  The `focus:not-sr-only` variant reveals it on keyboard focus.
- Client components start with `"use client";` and live under `src/components/`.
  See `src/components/shared/header.tsx` for the `"use client"` + hook pattern.
- Navigation hooks come from `next/navigation` (`usePathname`) — see
  `src/components/shared/app-sidebar.tsx:6`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | all pass (no regressions) |
| Dev (manual smoke) | `pnpm dev` | app serves; see Step 4 |

## Suggested executor toolkit

- If available, invoke `web-design-guidelines` to confirm skip-link and
  focus-management semantics (focus-visible, `tabIndex={-1}` target, no
  scroll-jank).

## Scope

**In scope**:
- `src/components/shared/skip-to-content.tsx` (create) — the skip link.
- `src/components/shared/route-focus.tsx` (create) — moves focus to `#main-content`
  on pathname change.
- `src/app/app/layout.tsx` — render the skip link first, add `id`/`tabIndex` to
  `<main>`, mount `RouteFocus`.

**Out of scope** (do NOT touch):
- `src/components/shared/app-sidebar.tsx` — except note that plan 037 adds an
  `aria-label` to its `<aside>`. Do not edit it here.
- `src/components/shared/header.tsx` — unchanged.
- Any route page under `src/app/app/**/page.tsx` — no per-page changes.
- Do NOT add focus management to drawers/dialogs here — that's plan 040.

## Git workflow

- Shared checkout — run `git branch --show-current` before committing.
- Branch: `feat/036-skip-link-landmarks`.
- Commit: `feat(a11y): add skip-to-content link and focus management on navigation`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create the skip-to-content link

Create `src/components/shared/skip-to-content.tsx`:

```tsx
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
    >
      Skip to main content
    </a>
  );
}
```

This is a plain element — no `"use client"` needed.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Create the route-focus client component

Create `src/components/shared/route-focus.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Next.js App Router does not move focus on client-side navigation. After each
 * route change, move keyboard focus to the main landmark so screen-reader and
 * keyboard users land at the start of the new page's content.
 */
export function RouteFocus() {
  const pathname = usePathname();
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main) main.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}
```

`preventScroll: true` avoids a scroll jump when focus moves.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Wire them into the layout

Edit `src/app/app/layout.tsx`:

1. Add imports:
   ```tsx
   import { SkipToContent } from "@/components/shared/skip-to-content";
   import { RouteFocus } from "@/components/shared/route-focus";
   ```
2. Render `<SkipToContent />` as the **first** child inside `<DragProvider>`
   (before the `<div className="flex h-screen overflow-hidden">`), so it is the
   first focusable element in tab order.
3. Make `<main>` a focusable skip target — change line 25 to:
   ```tsx
   <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col overflow-hidden outline-none">{children}</main>
   ```
   (`tabIndex={-1}` makes it programmatically focusable without adding it to the
   tab sequence; `outline-none` suppresses the focus ring on the container since
   focus here is programmatic, not a user-driven tab stop.)
4. Mount `<RouteFocus />` once, anywhere inside `<DragProvider>` (e.g. next to
   the other always-mounted components like `<InfoDrawer />`).

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 4: Manual smoke test

Run `pnpm dev`, open the app signed in, and:

1. Load any `/app/*` page. Press **Tab** once from the top of the page — the
   first focusable element is the visible "Skip to main content" link. Press
   **Enter** → focus jumps to the main content area (subsequent Tab presses move
   within the content, not back through the sidebar).
2. The skip link is invisible until focused (it should not appear in the normal
   layout).
3. Navigate via the sidebar (e.g. Buckets → Connections). Focus does not stay
   stranded on the sidebar link; it moves to the main content (verify with a
   screen reader if available, or by pressing Tab after navigation and confirming
   you're inside the new page's content).
4. No visible scroll jump on navigation.

**Verify**: all four behaviors observed. Report any deviation.

### Step 5: Full gate

**Verify**: `pnpm test` (all pass), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0).

## Test plan

- This is layout/interaction wiring; the repo has no DOM-interaction harness for
  the app shell, so verification is the Step 4 manual smoke plus a green
  `pnpm test`/`typecheck`/`lint`.
- Do NOT stand up a new test harness for this plan. State in your report that you
  relied on the manual smoke.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 (no regressions)
- [ ] `src/components/shared/skip-to-content.tsx` and
      `src/components/shared/route-focus.tsx` exist
- [ ] `grep -n 'id="main-content"' src/app/app/layout.tsx` shows the id on `<main>`
- [ ] `grep -n "SkipToContent" src/app/app/layout.tsx` shows it rendered
- [ ] Manual smoke (Step 4) all four behaviors pass
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `src/app/app/layout.tsx` no longer has a single `<main>` element as excerpted
  (the shell was restructured) — the skip target and focus logic need re-siting.
- `sr-only`/`focus:not-sr-only` do not visually hide/reveal the link (Tailwind
  utilities missing) — report; do not hand-roll a visually-hidden style.
- Moving focus to `<main>` causes a visible scroll jump even with
  `preventScroll: true` — report; do not add scroll hacks.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Single skip target**: there is exactly one `id="main-content"`. If a second
  main region is ever added (e.g. split-view panes each claiming "main"), keep
  the id unique and point the skip link + `RouteFocus` at the primary one.
- **Coordination with plan 037**: plan 037 adds `aria-label="Sidebar"` (or
  similar) to the `<aside>` in `app-sidebar.tsx` and `aria-current` to nav links.
  This plan deliberately does not touch that file. If both land, no conflict —
  different files.
- Reviewer should scrutinize: the skip link is the *first* tab stop; `<main>`
  focus does not steal focus from inputs mid-typing (it only fires on pathname
  change, which is fine); and `RouteFocus` returns `null` (renders nothing).
- Deferred follow-up (not in this plan): per-route document `<title>` updates for
  orientation (NAV-08) and a responsive/collapsible sidebar for small screens
  (NAV-10, needs a product call). Both recorded in `plans/README.md`.
