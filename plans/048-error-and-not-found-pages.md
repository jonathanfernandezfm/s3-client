# Plan 048: Add branded error boundaries and a 404 page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat c0e3376..HEAD -- src/app`
> If `src/app/error.tsx`, `src/app/global-error.tsx`, or `src/app/not-found.tsx`
> now exist, STOP — this plan assumes they are absent.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx / ux
- **Planned at**: commit `c0e3376`, 2026-06-23

## Why this matters

The app ships with **no** React error boundary and **no** 404 page. Verified:
`src/app/error.tsx`, `src/app/global-error.tsx`, and `src/app/not-found.tsx` do
not exist anywhere under `src/app`. Today, an uncaught render or data error
drops the user onto Next.js's default error screen, and a bad URL (e.g. an
invalid public share slug `/s/whatever`, or a mistyped `/app/...` route) shows
the unstyled framework 404. For a public launch this is an avoidable bad first
impression and leaks a framework-default look. Adding three small files gives a
branded, reassuring fallback with a clear recovery action.

## Current state

- **No** `error.tsx` / `global-error.tsx` / `not-found.tsx` under `src/app`
  (confirm: `find src/app -name "error.tsx" -o -name "global-error.tsx" -o -name "not-found.tsx"`
  returns nothing).
- Root layout: `src/app/layout.tsx` (wraps the whole app — provides `<html>`,
  fonts, providers). `global-error.tsx` **replaces** this layout when the root
  itself crashes, so it must render its own `<html>` and `<body>`.
- The dashboard has its own nested layout `src/app/app/layout.tsx`.
- **Design tokens & component conventions to match** — this repo uses Tailwind
  utility classes with semantic tokens (`text-muted-foreground`, `bg-muted`,
  `border`, etc.) and a shared `Button`. Exemplar to mirror for a centered
  full-height fallback panel — `src/components/billing/locked-page-overlay.tsx`:
  ```tsx
  <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
    <div className="rounded-full bg-muted p-4">
      <Lock className="h-6 w-6 text-muted-foreground" />
    </div>
    <div className="text-center">
      <h2 className="text-lg font-semibold">{feature}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
    <Button ...>Upgrade to PRO — $4/mo</Button>
  </div>
  ```
- Shared button: `import { Button } from "@/components/ui/button"`.
- Icons: `lucide-react` (e.g. `AlertTriangle`, `FileQuestion`, `RotateCcw`).
- Path alias: `@/*` → `src/*`.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0, no errors   |
| Lint      | `pnpm lint`      | exit 0              |
| Build     | `pnpm build`     | exit 0 (compiles the new special files) |
| Tests     | `pnpm test`      | all pass (no regressions) |

## Scope

**In scope** (all create):
- `src/app/error.tsx` — route-segment error boundary (client component).
- `src/app/global-error.tsx` — root error boundary (client component, renders
  its own `<html>`/`<body>`).
- `src/app/not-found.tsx` — 404 page.

**Out of scope** (do NOT touch):
- `src/app/layout.tsx` — leave the root layout alone.
- Any provider, store, or existing page.
- Do not add per-route `error.tsx` files in nested segments — one top-level
  boundary is sufficient for this plan.

## Git workflow

- Branch: `advisor/048-error-and-not-found-pages`
- Commit message (conventional style, matches `git log`):
  `feat: add error boundary and 404 pages`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `src/app/error.tsx` (segment error boundary)

Next.js requires this to be a Client Component and to accept `{ error, reset }`.
Keep copy reassuring and generic (do not render `error.message` to the user —
it can leak internals; log it to the console instead).

```tsx
"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="rounded-full bg-muted p-4">
        <AlertTriangle className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          An unexpected error occurred. You can try again, and if it keeps
          happening, please reload the page.
        </p>
      </div>
      <Button onClick={() => reset()}>
        <RotateCcw className="h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: `src/app/global-error.tsx` (root boundary)

This catches errors in the root layout itself, so it must provide `<html>` and
`<body>`. It cannot rely on the app's providers/fonts (they may be what failed).

```tsx
"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: "0.875rem", color: "#6b7280", maxWidth: "24rem", textAlign: "center" }}>
          An unexpected error occurred while loading the app. Please reload the page.
        </p>
        <button
          onClick={() => reset()}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            border: "1px solid #d1d5db",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
```

Use inline styles here (not Tailwind classes / shared `Button`) because Tailwind
and the app shell may not be available when the root layout has crashed.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: `src/app/not-found.tsx` (404)

This is a Server Component by default (no `"use client"` needed). Use a plain
`<a href>` for navigation rather than the client `Link`/`Button` to keep it
dependency-free, or use `next/link` (it works in server components). Keep it
simple and on-brand with the muted-token style:

```tsx
import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="rounded-full bg-muted p-4">
        <FileQuestion className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold">Page not found</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          The page you’re looking for doesn’t exist or may have been moved.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted/60"
      >
        Go home
      </Link>
    </div>
  );
}
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Build + gate

`pnpm build` compiles these special files and will fail if `error.tsx` /
`global-error.tsx` are missing `"use client"` or have the wrong prop shape.

**Verify**: `pnpm build` → exit 0; then `pnpm lint && pnpm test` → all exit 0.

## Test plan

- These are framework special files; no unit tests are required (and the repo
  has no page-render test harness for them).
- Manual smoke (do this in the executor's worktree if a dev server is available,
  otherwise note it as a reviewer check):
  - Visit a non-existent route like `/this-does-not-exist` → branded 404 renders.
  - Visit a non-existent public share `/s/zzzzzzzz` → confirm whether it routes
    through `not-found.tsx` or the share page's own empty state (either is
    acceptable; just confirm no raw framework page).
- Regression: `pnpm test` must stay green (these files add no logic that
  existing tests cover, but confirm nothing breaks).

## Done criteria

ALL must hold:

- [ ] `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`
      all exist
- [ ] `error.tsx` and `global-error.tsx` start with `"use client"` and accept
      `{ error, reset }`
- [ ] `global-error.tsx` renders its own `<html>` and `<body>`
- [ ] No user-facing surface renders `error.message` (only `console.error` logs it)
- [ ] `pnpm build` exits 0
- [ ] `pnpm typecheck && pnpm lint && pnpm test` all exit 0
- [ ] Only the three in-scope files are added (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any of the three target files already exist (drift).
- `pnpm build` reports that `global-error.tsx` conflicts with an existing root
  error setup.
- Adding `lucide-react` icons causes a typecheck error (the icon name may differ
  by version — substitute a valid exported icon and note it, do not add a new
  dependency).

## Maintenance notes

- If error reporting (Sentry/PostHog capture) is added later, wire it into the
  `useEffect` in `error.tsx` and `global-error.tsx` where `console.error`
  currently lives — those are the single capture points.
- Reviewer should confirm no internal error details (stack/message) are shown to
  end users.
- Follow-up deferred: nested per-route `error.tsx` for finer-grained recovery
  (e.g. inside `/app/app/browser`) is intentionally out of scope; the top-level
  boundary covers the launch requirement.
