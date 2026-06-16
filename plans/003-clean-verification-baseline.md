# Plan 003: Restore a clean `test + typecheck + lint` baseline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 6dbaee9..HEAD -- prisma/schema.prisma src/generated/prisma src/components/shared/theme-toggle.tsx src/components/public-share/theme-toggle.tsx src/components/shared/notifications.tsx src/components/landing/landing-page.test.tsx src/components/shared/app-sidebar.tsx src/lib/stores src/hooks/use-toast.ts src/lib/contexts/drag-context.tsx src/app/api/objects/download-zip src/components/providers/posthog-provider.tsx src/lib/analytics.ts package.json`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW (mechanical fixes to baseline; no behavior change)
- **Depends on**: none — this plan unblocks every other plan in this index
- **Category**: dx + tests
- **Planned at**: commit `6dbaee9`, 2026-06-13

## Why this matters

At `6dbaee9` the verification picture is:

- `pnpm test` → 462 / 462 pass (clean).
- `pnpm exec tsc --noEmit` → **11 errors**.
- `pnpm lint` → **27 problems (12 errors, 15 warnings)**.

Two of three gates are red on `main`. The existing `plans/001` and `plans/002`
both ship with the workaround "gate = no NEW problems vs the captured dirty
baseline", which is fragile (executors must capture and diff a baseline by
hand) and means any *real* new regression hides among 38 pre-existing
problems. Every plan in this index — and every PR going forward — improves
massively when `pnpm test && pnpm typecheck && pnpm lint` all exit 0.

None of the errors are deep: every one is mechanical. They cluster in five
groups, and one `pnpm prisma generate` plus a dozen line edits clear them.

## Current state

### Group A — stale generated Prisma client (4 of 11 tsc errors)

`prisma/schema.prisma:40` declares `METADATA_CHANGE` in the `ActivityAction`
enum, but `src/generated/prisma/` was last generated before that line landed,
so the generated `ActivityAction` type omits it. That cascades to:

- `src/app/api/objects/metadata/route.ts:100`:
  ```ts
  await recordActivity({
    // …
    action: "METADATA_CHANGE",
  ```
  → `error TS2322: Type '"METADATA_CHANGE"' is not assignable to type 'ActivityAction'`.
- `src/components/info-drawer/activity-tab.tsx:24` — same TS2322.
- `src/components/activity/event-format.ts:12` — `error TS2353: 'METADATA_CHANGE' does not exist in type 'Record<ActivityAction, string>'`.
- `src/components/info-drawer/activity-tab.tsx:45` — same TS2353.

The fix is `pnpm prisma generate`. No source edits needed for this group.

### Group B — missing third-party types (4 of 11 tsc errors)

- `src/app/api/objects/download-zip/route.ts:3` —
  `import { ZipArchive, Archiver, type ArchiverError } from "archiver";`
  produces `TS2307: Cannot find module 'archiver' or its corresponding type
  declarations`. `@types/archiver` v8 IS in devDependencies (`package.json:60`)
  but the v8 archiver runtime renamed/added exports (`ZipArchive`) that the
  installed `@types/archiver` may not cover. Confirm by reading
  `node_modules/@types/archiver/index.d.ts` for the `ZipArchive` and
  `Archiver` exports. If missing, take the path-of-least-surprise: add a
  one-file ambient declaration `src/types/archiver.d.ts` that re-exports the
  needed names. Do NOT downgrade the runtime `archiver` package — the route
  uses v8 APIs.
- `src/app/api/objects/download-zip/route.ts:85` —
  `archive.on("error", (err) => passthrough.destroy(err))` lacks a type
  annotation on `err` → `TS7006: Parameter 'err' implicitly has an 'any' type`.
  Fix by annotating `(err: Error) => …` (or `(err: ArchiverError)` once the
  type is available).
- `src/lib/analytics.ts:1` — `import posthog from "posthog-js"` →
  `TS2307`. `posthog-js` 1.386.x DOES ship its own types (see
  `node_modules/posthog-js/dist/module.d.ts` and the `types`/`exports` fields
  in `node_modules/posthog-js/package.json`). The most likely cause is a
  stale `tsconfig.tsbuildinfo` from before `posthog-js` was installed. The
  fix is to delete `tsconfig.tsbuildinfo` and re-run `tsc --noEmit`. If the
  error still reproduces, add `"types": ["node"]` is not the cure; instead,
  verify pnpm did not skip the post-install symlink (`pnpm install --force`
  fixes that). Do NOT add `// @ts-ignore` — the underlying issue is
  environmental, not in the code.
- `src/components/providers/posthog-provider.tsx:3` and `:4` — same root cause
  as `analytics.ts`. Two TS2307 errors disappear when the import resolution
  is fixed.

### Group C — stale `@ts-expect-error` directives (2 of 11 tsc errors)

`src/components/landing/landing-page.test.tsx:39-42`:

```ts
  // @ts-expect-error test stub
  window.IntersectionObserver = MockObserver;
  // @ts-expect-error test stub
  window.ResizeObserver = MockObserver;
```

Both directives are unused (`TS2578: Unused '@ts-expect-error' directive`) —
the `MockObserver` class is now assignable to the corresponding browser-API
types without the cast. Delete both `// @ts-expect-error test stub` lines.

### Group D — `react-hooks/set-state-in-effect` lint errors (3 of 12 lint errors)

`src/components/shared/theme-toggle.tsx:10-13`:

```tsx
useEffect(() => {
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(isDark ? "dark" : "light");
}, []);
```

`src/components/public-share/theme-toggle.tsx` is a near-duplicate of the
above (file exists per `find`; same hydration pattern, same error). Both
should be deduplicated to a single shared component AND fixed in the same
step. The canonical fix is initial-state-from-lazy-init: stop calling
`setTheme` inside the effect, and read the system preference from a
client-only initializer instead. Pattern:

```tsx
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

function readSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeToggle() {
  // Lazy initializer runs once on the client; no setState in effect.
  const [theme, setTheme] = useState<"light" | "dark">(readSystemTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme((p) => p === "light" ? "dark" : "light")}>
      {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
```

(Lazy `useState(readSystemTheme)` is what React docs call "initializer
function"; it runs once during mount, never on re-render. There is no
flash-of-wrong-theme risk that the original `useEffect` was guarding against
that this doesn't also handle, because either way the first paint happens
client-side under `"use client"`.)

`src/components/shared/notifications.tsx:60-83` — the
`NotificationItem` effect:

```tsx
useEffect(() => {
  if (!duration) return;

  progressRef.current = 100;
  setProgress(100);                            // ← the lint error
  // … sets up the interval; the timer body uses setProgress conditionally
}, [notification.id, notification.status, duration, removeNotification]);
```

The `setProgress(100)` call is redundant — `progress` is initialized to `100`
in `useState(100)` at line 55, and every later `setProgress(progressRef.current)`
inside the interval body sets it from the ref. The reset to `100` on
re-mount (a different notification id) is already covered by the initial
state because the component re-mounts when the key changes. Remove the
single line `setProgress(100);` and the `progressRef.current = 100;` above
it (the ref is already initialized to `100` at line 57 and never used before
being read inside the interval).

If empirical testing shows the reset is actually needed for status changes
on the same id, replace it with a separate effect that watches only the
inputs that should reset: that's an architectural decision; the simple
deletion is the right first step.

### Group E — unused-symbol lint warnings (5 of 15 warnings)

These are pure dead-code removals.

- `src/components/shared/app-sidebar.tsx:49` — `Star` imported, never used.
  Delete it from the lucide-react import line.
- `src/lib/contexts/drag-context.tsx:4` — `DragState` type imported, never
  used. Delete from the import.
- `src/lib/stores/browser-store.ts:89` — destructure assigns `removed` from
  the pane state but never reads it. Replace
  `const { [paneId]: removed, ...rest } = state.paneStates;` with
  `const { [paneId]: _omit, ...rest } = state.paneStates;` and a single-line
  `// eslint-disable-next-line @typescript-eslint/no-unused-vars` ABOVE that
  line, OR use the cleaner Object pattern:
  ```ts
  const rest = Object.fromEntries(
    Object.entries(state.paneStates).filter(([id]) => id !== paneId)
  );
  ```
  Prefer the second form (no disable comment).
- `src/lib/stores/layout-store.ts:234` and `:283` — two more `removed` /
  `grid` unused destructure binds. Same treatment as the previous bullet.
- `src/hooks/use-toast.ts:17` — `const actionTypes = { … } as const;` whose
  only consumer is `type ActionType = typeof actionTypes[keyof typeof actionTypes]`.
  This is fine as-is conceptually but the lint rule sees `actionTypes` as
  "value never read." Replace the runtime const with a TS-only declaration:
  ```ts
  type ActionType =
    | "ADD_TOAST"
    | "UPDATE_TOAST"
    | "DISMISS_TOAST"
    | "REMOVE_TOAST";
  ```
  Verify the union members exactly match the keys of the deleted const so
  the type stays equivalent.

The remaining 10 warnings (`react-hooks/exhaustive-deps`,
`@next/next/no-img-element` on `version-history-dialog.tsx:236`) are NOT in
scope for this plan; they pre-existed at `a4acb59`'s direction-only audit and
require behavior judgment. Keep them as warnings.

### Group F — add `pnpm typecheck` script

`package.json:5-12` has scripts `dev`, `build`, `start`, `db:migrate:deploy`,
`lint`, `test`, `test:watch`. There is no `typecheck`. Add:

```json
"typecheck": "tsc --noEmit",
```

(Slot it alphabetically between `test:watch` and `db:migrate:deploy` per the
file's loose ordering — exact position doesn't matter; group with `lint`.)

This is the canonical command CI and reviewers will use. The plan 005 CI
workflow depends on this script existing.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Prisma generate | `pnpm prisma generate` | exit 0; `src/generated/prisma/enums.ts` now includes `METADATA_CHANGE` |
| Typecheck | `pnpm exec tsc --noEmit` | exit 0, **0 errors** |
| Lint | `pnpm lint` | exit 0, **0 errors**; warnings ≤ 10 (the non-in-scope `exhaustive-deps` + `no-img-element` ones remain) |
| Tests | `pnpm test` | exit 0, 462+ pass |
| New script | `pnpm typecheck` | exit 0, 0 errors |

Capture both dirty baselines before Step 1:

```bash
pnpm lint 2>&1 | tail -1   # → "27 problems (12 errors, 15 warnings)"
pnpm exec tsc --noEmit 2>&1 | grep -c "error TS"   # → 11
```

so you can confirm the deltas after each group.

## Scope

**In scope** (the only files you should modify or create):

- `src/generated/prisma/**` — regenerated, not hand-edited (Group A).
- `src/types/archiver.d.ts` — create only if the existing `@types/archiver`
  lacks the v8 exports (Group B).
- `src/app/api/objects/download-zip/route.ts` — annotate `err` (Group B).
- `tsconfig.tsbuildinfo` — delete (Group B); it will be re-generated.
- `src/components/landing/landing-page.test.tsx` — remove unused `@ts-expect-error` (Group C).
- `src/components/shared/theme-toggle.tsx` — rewrite per Group D pattern.
- `src/components/public-share/theme-toggle.tsx` — **delete** as part of the dedup; its single import site (search for it with `grep -rn "public-share/theme-toggle" src`) must be updated to import from `@/components/shared/theme-toggle`.
- `src/components/shared/notifications.tsx` — remove the redundant `setProgress(100)` and `progressRef.current = 100` lines.
- `src/components/shared/app-sidebar.tsx` — drop `Star` from the lucide import (Group E).
- `src/lib/contexts/drag-context.tsx` — drop `DragState` from the imports.
- `src/lib/stores/browser-store.ts` — replace destructure with filter form.
- `src/lib/stores/layout-store.ts` — same, twice.
- `src/hooks/use-toast.ts` — replace const with `type` declaration.
- `package.json` — add `"typecheck": "tsc --noEmit"` to scripts.
- `plans/README.md` — status row.

**Out of scope** (do NOT touch, even though they look related):

- The two remaining lint warnings at `src/components/versions/version-history-dialog.tsx:42` (`exhaustive-deps`) and `:236` (`<img>` usage). Both pre-exist at `a4acb59` and require behavior judgment; defer them.
- Any `--fix` mass-rewrite of the codebase. The fixes above are all surgical; do not run `eslint --fix .`.
- The `dotenv` and `@vitest/runner` package-hygiene questions (separate plan).
- The actual archiver upgrade or replacement.
- All API route handlers other than `download-zip/route.ts:85`.
- `prisma/schema.prisma` — no schema change, only regenerate.

## Git workflow

- This repo's main checkout is shared by concurrent sessions — run
  `git branch --show-current` before each commit and make sure you are still
  on your branch.
- Branch: `chore/clean-verification-baseline` off `main`.
- Conventional commits per `git log` style, e.g.
  `chore(prisma): regenerate client to include METADATA_CHANGE`,
  `fix(theme-toggle): remove setState-in-effect anti-pattern and dedupe public/dashboard variants`,
  `chore(deps): annotate archiver error parameter`,
  `chore(scripts): add typecheck`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Regenerate Prisma (Group A)

Run `pnpm prisma generate`. Confirm:

```bash
grep -c "METADATA_CHANGE" src/generated/prisma/enums.ts
```

→ at least `1`.

**Verify**: `pnpm exec tsc --noEmit 2>&1 | grep -c "error TS"` → drops from 11 to **7**.

### Step 2: Resolve third-party type imports (Group B)

(a) Delete `tsconfig.tsbuildinfo` (stale build info from before posthog-js
was installed):
```bash
rm tsconfig.tsbuildinfo
```

(b) Run `pnpm install` to make sure all packages are linked, then re-run
`pnpm exec tsc --noEmit`. If only the archiver-related errors remain,
proceed to (c). If posthog-js errors still appear, run
`pnpm install posthog-js --force` once and re-check.

(c) Inspect `node_modules/@types/archiver/index.d.ts`:
```bash
grep -E "ZipArchive|export" node_modules/@types/archiver/index.d.ts | head -20
```
If `ZipArchive` is not exported, create `src/types/archiver.d.ts`:
```ts
declare module "archiver" {
  import type { Readable } from "stream";

  export interface ArchiverError extends Error {
    code?: string;
    data?: unknown;
  }

  export interface Archiver extends Readable {
    pipe<T extends NodeJS.WritableStream>(destination: T, options?: { end?: boolean }): T;
    append(source: Readable | Buffer | string, opts: { name: string }): this;
    finalize(): Promise<void>;
    abort(): void;
    on(event: "warning", listener: (err: ArchiverError) => void): this;
    on(event: "error", listener: (err: ArchiverError) => void): this;
    on(event: "entry", listener: () => void): this;
    once(event: "entry" | "error", listener: (err?: ArchiverError) => void): this;
    off(event: "entry" | "error", listener: (...args: never[]) => void): this;
  }

  export class ZipArchive {
    constructor(options?: { store?: boolean; zlib?: { level?: number } });
  }
  // ZipArchive instances satisfy the Archiver interface at runtime.
  export interface ZipArchive extends Archiver {}
}
```

(Confirm the shape matches the way `download-zip/route.ts` actually uses
each name before pasting verbatim. The shim only needs to cover the
exports used in `src/`.)

(d) Annotate the archive error handler at
`src/app/api/objects/download-zip/route.ts:85`:
```ts
archive.on("error", (err: Error) => passthrough.destroy(err));
```

**Verify**: `pnpm exec tsc --noEmit 2>&1 | grep -c "error TS"` → drops from 7 to **2** (only the two `landing-page.test.tsx` directives remain).

### Step 3: Remove stale `@ts-expect-error` directives (Group C)

In `src/components/landing/landing-page.test.tsx`, delete lines 39 and 41
(the two `// @ts-expect-error test stub` comments). Leave the assignments
themselves intact.

**Verify**: `pnpm exec tsc --noEmit` → exit 0, **0 errors**.
`pnpm typecheck` not yet added — that comes in Step 6.

### Step 4: Fix `set-state-in-effect` errors and dedupe `ThemeToggle` (Group D)

(a) In `src/components/shared/theme-toggle.tsx`, replace the whole file with
the lazy-initializer pattern shown in "Group D" above (Current state).

(b) Find the consumer of `src/components/public-share/theme-toggle.tsx`:
```bash
grep -rn "public-share/theme-toggle" src --include="*.ts" --include="*.tsx"
```
Update each import to point at `@/components/shared/theme-toggle` (likely
just one site — a public-share layout). Then delete
`src/components/public-share/theme-toggle.tsx`.

(c) In `src/components/shared/notifications.tsx`, delete BOTH lines:
```tsx
    progressRef.current = 100;
    setProgress(100);
```
(currently lines 63–64). Leave the rest of the effect intact — `setProgress`
inside the interval callback is fine (it's not synchronous inside the
effect body).

**Verify**: `pnpm lint 2>&1 | grep -c "set-state-in-effect"` → **0**.

### Step 5: Remove unused symbols (Group E)

Apply each edit listed in "Group E" above. After all five:

**Verify**:
```bash
pnpm lint 2>&1 | tail -1
```
→ "0 errors, ≤10 warnings".

### Step 6: Add `typecheck` script (Group F)

In `package.json`, add `"typecheck": "tsc --noEmit"` to the `"scripts"`
object (between `"lint"` and `"test"` is the natural slot).

**Verify**: `pnpm typecheck` → exit 0.

### Step 7: Final composite-gate verification

Run all three gates with no flags:

```bash
pnpm test && pnpm typecheck && pnpm lint
```

→ exit 0 from the chain. Save the output and confirm:
- Tests: 462+ pass.
- Typecheck: zero errors printed.
- Lint: zero errors; warnings only at `version-history-dialog.tsx:42` and
  `:236` (the two deferred ones).

This is the clean baseline. All subsequent plans (004–011) can now use a
plain "exit 0 from `pnpm test && pnpm typecheck && pnpm lint`" gate instead
of capturing/diffing dirty baselines.

## Test plan

No new product tests in this plan. Existing 462 must still pass.

Quality checks that DO matter:

- `pnpm test` → 462+ pass and **no regressions in
  `src/components/landing/landing-page.test.tsx`** (Step 3 removes
  directives but not assignments — the test must still mount `LandingPage`).
- `pnpm dev` smoke test: open the dashboard, toggle the theme (dashboard
  AND the public share-link page; visit any `(public)/s/[slug]` route),
  observe no console errors and the toggle works on both surfaces. The
  refactor in Step 4 changes how the theme is initialized — verify there
  is no flash-of-wrong-theme on a hard reload.

## Done criteria

ALL must hold:

- [ ] `pnpm prisma generate` ran and `grep METADATA_CHANGE src/generated/prisma/enums.ts` matches.
- [ ] `pnpm test` exits 0; 462+ tests pass.
- [ ] `pnpm typecheck` exists as a script and exits 0 with 0 errors.
- [ ] `pnpm lint` exits 0 with 0 errors (warnings are allowed for the two deferred sites only).
- [ ] `git diff --stat main` shows only files in the Scope section's "in scope" list.
- [ ] `find src/components -name "theme-toggle.tsx" | wc -l` → 1 (the duplicate is gone).
- [ ] `plans/README.md` status row updated to DONE.

## STOP conditions

Stop and report back (do not improvise) if:

- After Step 2 the posthog-js errors persist even after deleting
  `tsconfig.tsbuildinfo` and running `pnpm install --force` — there may be
  a tsconfig/path issue this plan didn't account for. Report the exact
  remaining error.
- `grep -rn "public-share/theme-toggle" src` returns zero matches before
  the file is deleted (Step 4b) — there's nothing to update, but the
  duplicate's existence on disk implies SOMETHING was importing it; verify
  with a broader `grep -rn "theme-toggle" src` to find the true caller
  before deleting.
- The Group A regeneration changes more than `src/generated/prisma/**` and
  `prisma/migrations/**` (it shouldn't — `pnpm prisma generate` only writes
  to the generated output path). If `git status` shows other dirty paths,
  STOP.
- A `pnpm install --force` mutates dependency versions in `pnpm-lock.yaml`
  beyond a no-op refresh.
- The shared `ThemeToggle` rewrite breaks any existing test (likely none,
  but verify).

## Maintenance notes

- The two surviving lint warnings (`exhaustive-deps` at
  `version-history-dialog.tsx:42` and `<img>` at `:236`) are deferred
  intentionally — fixing them requires behavior judgment (memoize a list,
  swap to `next/image`). They can be addressed alongside any future work
  in that file. The composite gate ignores warnings.
- The archiver type shim at `src/types/archiver.d.ts` is the maintenance
  cliff: if `archiver` ever upgrades again, regenerate or remove the shim.
  Prefer removing the shim if a future `@types/archiver` covers v8 cleanly.
- Once plan 005 (CI workflow) lands, the composite gate will run on every
  PR. If a future change reintroduces lint or tsc errors, the PR will go
  red — that's intentional. Do not re-add a dirty baseline.
- `prisma generate` is a build-time step (`package.json:7`), but a developer
  who edits the schema without rebuilding will see stale generated types
  locally. Plan 005's CI will catch this on PRs; plan that adds a
  `postinstall` hook is out of scope for this plan (would also re-run
  generate on every install).
- Reviewer focus: confirm the `ThemeToggle` initial paint matches the
  system preference on the public share page (the file most likely to
  regress, since its import site is updated mid-plan).
