# Plan 040: Give the Properties and Info drawers dialog semantics, focus-on-open, and focus restoration

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/components/properties-drawer/properties-drawer.tsx src/components/info-drawer/info-drawer.tsx`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction (accessibility)
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

The Properties drawer and Info drawer are modal side panels, but they're
hand-built `<div>`s that are missing the things a modal needs to be usable
without a mouse:

- No `role="dialog"` / `aria-modal="true"` / `aria-labelledby`, so a screen
  reader doesn't announce them as dialogs or name them.
- No **focus-on-open**: opening a drawer leaves keyboard focus wherever it was
  (often the trigger row), so a keyboard user has to blind-Tab to find the
  drawer's controls.
- No **focus restoration**: closing the drawer (Escape or overlay click) drops
  focus to `<body>`, losing the user's place.

This plan adds those three reliable fixes to both drawers. A full focus *trap*
(preventing Tab from reaching background content) is deliberately deferred to a
follow-up that migrates these to the repo's Radix `Dialog` (which traps + makes
the background inert for free) — see Maintenance notes. The wins here are
high-value, low-complexity, and don't touch the slide animation.

## Current state

Both drawers have the same structure. `src/components/properties-drawer/properties-drawer.tsx`:

- Store + open flag (line 55): `const { isOpen, scope, close } = usePropertiesDrawerStore();`
- An Escape handler already exists (lines 71-78):
  ```tsx
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, close]);
  ```
- The overlay + panel (lines 80-130):
  ```tsx
  {isOpen && (<div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 39 }} onClick={close} />)}
  <div
    aria-label="Properties drawer"
    aria-hidden={!isOpen}
    style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: 380, zIndex: 40,
      transform: isOpen ? "translateX(0)" : "translateX(100%)",
      transition: "transform 220ms ...", pointerEvents: isOpen ? "auto" : "none", ... }}
    className="bg-background border-l border-border shadow-xl"
  >
    <div className="flex items-start justify-between px-4 py-3 border-b ...">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Properties</h2>
        </div>
        ...
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={close} title="Close">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
    ... body ...
  </div>
  ```
  The panel is **always mounted**; `isOpen` toggles `transform`/`aria-hidden`/
  `pointerEvents`. There is a heading `<h2>Properties</h2>` (line 113) and a
  close `<Button>` (lines 121-129) with `title="Close"` but no `aria-label`.

`src/components/info-drawer/info-drawer.tsx` is the same shape: store at line 30
(`isOpen, ..., close`), Escape handler at lines 44-51, overlay at lines 57-62,
panel at lines 64-82 with `aria-label="Info drawer"`, a heading `<h2>` at line 88
(`{TAB_META[activeTab].label}`), and a close button further down (search for the
`X` icon button with `onClick={close}` / `title="Close"`).

Conventions to match:
- The repo's modal exemplar is Radix-based: `src/components/ui/dialog.tsx`. Note
  its `DialogPrimitive.Content` uses `tabIndex={-1}` and its close button uses
  `<span className="sr-only">Close</span>` for the accessible name (line 52).
- Client components (`"use client"`) and React hooks (`useRef`, `useEffect`) are
  already imported in both files.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | all pass (no regressions) |
| Dev (manual smoke) | `pnpm dev` | app serves; see Step 4 |

## Suggested executor toolkit

- If available, invoke `web-design-guidelines` for dialog semantics
  (`role="dialog"`, `aria-modal`, `aria-labelledby`, focus-on-open / restore).

## Scope

**In scope** (modify only):
- `src/components/properties-drawer/properties-drawer.tsx`
- `src/components/info-drawer/info-drawer.tsx`

**Out of scope** (do NOT touch):
- The drawer **stores** (`properties-drawer-store`, `info-drawer-store`) — read
  `isOpen`/`close` as today; do not change them.
- The slide animation (`transform`/`transition` inline styles) — keep it.
- The drawer body/tab content components — only the panel wrapper + header change.
- Do NOT migrate to Radix `Dialog` in this plan (that's the deferred follow-up).
- Do NOT add a focus trap library or hand-roll Tab-cycling — out of scope here.

## Git workflow

- Shared checkout — run `git branch --show-current` before committing.
- Branch: `feat/040-drawer-dialog-a11y`.
- Commit: `feat(a11y): dialog semantics + focus management for properties/info drawers`.
- Do NOT push or open a PR unless instructed.

## Steps

Apply the same changes to **both** files.

### Step 1: Add a container ref and a "previously focused element" ref

In `PropertiesDrawer` (and `InfoDrawer`), add near the top of the component:

```tsx
const panelRef = useRef<HTMLDivElement>(null);
const lastFocusedRef = useRef<HTMLElement | null>(null);
```

`useRef` is already imported in `properties-drawer.tsx` (line 3). For
`info-drawer.tsx`, add `useRef` to its existing `import { useEffect } from "react";`
(make it `import { useEffect, useRef } from "react";`).

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Focus on open, restore on close

Add an effect (next to the existing Escape effect):

```tsx
useEffect(() => {
  if (isOpen) {
    // remember where focus was so we can restore it on close
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    // move focus into the drawer
    panelRef.current?.focus({ preventScroll: true });
  } else {
    // restore focus to the trigger when closing
    lastFocusedRef.current?.focus?.({ preventScroll: true });
    lastFocusedRef.current = null;
  }
}, [isOpen]);
```

Note: the panel is always mounted, so `isOpen` flipping false runs the `else`
branch — that's the close path. Do NOT add `panelRef`/`lastFocusedRef` to the
dependency array (refs are stable; only `isOpen` should drive this).

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Add dialog roles + labelledby + focusable panel

On the panel `<div>` (the one with `aria-label="Properties drawer"` /
`"Info drawer"`):

1. Attach the ref: `ref={panelRef}`.
2. Add `role="dialog"` and `aria-modal="true"`.
3. Make it programmatically focusable: `tabIndex={-1}`.
4. Replace `aria-label="Properties drawer"` with `aria-labelledby="properties-drawer-title"`
   and give the heading an id. For `info-drawer.tsx` use
   `aria-labelledby="info-drawer-title"`.
   - Keep `aria-hidden={!isOpen}` so the closed (off-screen) panel stays hidden
     from assistive tech.

On the heading `<h2>`:
- Properties: `<h2 id="properties-drawer-title" className="text-sm font-semibold">Properties</h2>`
- Info: `<h2 id="info-drawer-title" className="text-sm font-semibold">{TAB_META[activeTab].label}</h2>`

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Name the close button

On each drawer's close `<Button>` (the icon-only one with `onClick={close}`),
add `aria-label="Close"` (keep the existing `title="Close"`).

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 5: Manual smoke test

Run `pnpm dev`, open a bucket with objects:

1. Open the **Properties** drawer (the SlidersHorizontal action on a file row, or
   wherever it's triggered). Keyboard focus moves into the drawer (Tab from there
   lands on the drawer's controls, e.g. the Close button, not the page behind).
2. Press **Escape** (or click the overlay) → the drawer closes and focus returns
   to the control that opened it (the trigger row/button), not `<body>`.
3. In devtools Accessibility pane (or a screen reader): the open drawer is a
   "dialog" named "Properties" (and the Info drawer named by its active tab); the
   Close button has an accessible name.
4. Repeat 1-3 for the **Info** drawer (Activity/Notes/Versions).
5. Opening/closing animation is unchanged (still slides in/out from the right).

**Verify**: all five behaviors observed on both drawers. Report any deviation.

### Step 6: Full gate

**Verify**: `pnpm test` (all pass), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0).

## Test plan

- No DOM-interaction harness exists for the drawers; verification is the Step 5
  manual smoke plus a green `pnpm test`/`typecheck`/`lint`. Do NOT build a new
  harness. State which path you took in your report.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 (no regressions)
- [ ] `grep -n 'role="dialog"' src/components/properties-drawer/properties-drawer.tsx src/components/info-drawer/info-drawer.tsx` shows both
- [ ] `grep -n "aria-labelledby" src/components/properties-drawer/properties-drawer.tsx src/components/info-drawer/info-drawer.tsx` shows both
- [ ] `grep -n "lastFocusedRef" src/components/properties-drawer/properties-drawer.tsx src/components/info-drawer/info-drawer.tsx` shows the restore logic in both
- [ ] Manual smoke (Step 5) all five behaviors pass on both drawers
- [ ] No files outside the two in-scope files are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Focusing the panel on open causes the page to scroll/jump even with
  `preventScroll: true` — report; do not add scroll hacks.
- Focus restoration focuses the wrong element or throws because the trigger
  unmounted (e.g. the file row scrolled out of the virtualized list) — report;
  the optional-chaining `?.focus?.()` should make it a safe no-op, but if focus
  lands somewhere disruptive, STOP rather than guessing.
- The panel is no longer always-mounted (it was changed to conditionally render)
  — the open/close effect logic differs; STOP and report.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Deferred follow-up (the real fix for focus-trapping)**: migrate both drawers
  to the repo's Radix `Dialog` (`src/components/ui/dialog.tsx`) which provides a
  focus trap, background `inert`, focus-on-open, and focus-restore out of the
  box. That's a larger change (the slide-in animation must be re-expressed via
  Radix `data-state` classes) and is intentionally out of this plan's scope. Once
  done, the manual focus logic added here can be removed. Recorded in
  `plans/README.md`.
- Without a trap, a keyboard user can still Tab to background content behind the
  open drawer. The overlay click + Escape close, plus focus-on-open, make this a
  meaningful improvement, but note it for the follow-up.
- Reviewer should scrutinize: the open/close effect depends only on `isOpen`;
  focus restoration doesn't fire on initial mount (it only runs the `else` branch
  when `isOpen` goes false, which is correct because `lastFocusedRef` is null
  until first open).
