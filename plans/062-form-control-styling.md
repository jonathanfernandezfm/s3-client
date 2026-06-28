# Plan 062: Consistent styling + focus rings for bare form controls

> Drift check (run first): `git diff --stat e9ad3b3..HEAD -- src/components/shares/share-dialog.tsx src/components/browser/destination-picker-dialog.tsx src/components/connections/connection-form.tsx src/components/teams/team-members-card.tsx src/components/public-share/password-form.tsx` — if changed, compare to live code; on mismatch STOP.

## Status
- Priority: P2 | Effort: S | Risk: LOW | Depends on: none | Category: UX/a11y
- Planned at: commit e9ad3b3, 2026-06-27

## Why this matters
The app is live. Several dialogs use bare native `<select>` and `<input type="checkbox">` elements (and one ad-hoc `<button>`) with minimal or no styling. They look unpolished next to the design-system `Input`/`Button` and — more importantly — most lack a visible keyboard focus ring, hurting keyboard accessibility. This applies one consistent style, no behavior change.

## Current state
The repo's text-input style lives in `src/components/ui/input.tsx`:
```
flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm
```
`Button` (`src/components/ui/button.tsx`) has variants incl. `link` and includes `focus-visible:ring-1 focus-visible:ring-ring`.

Bare controls to fix (READ each file first to find the exact current markup — line numbers are approximate leads, not facts):
- `src/components/browser/destination-picker-dialog.tsx` — two `<select>` (Connection ~line 83-93, Bucket ~line 98-112) currently `className="h-9 rounded-md border bg-background px-2"`.
- `src/components/shares/share-dialog.tsx` — a `<select>` (~148-156) and two `<input type="checkbox">` (~161-166 password, ~183-188 limit downloads).
- `src/components/connections/connection-form.tsx` — at least one `<input type="checkbox">` (~269-275 "Force path style"). (If a bare `<select>` also exists here, style it too.)
- `src/components/teams/team-members-card.tsx` — a role `<select>` (~145-154) currently `className="h-9 w-32"`.
- `src/components/public-share/password-form.tsx` — an ad-hoc `<button>` (~41-46) with inline classes and no focus ring.

## Scope
In scope (ONLY these source files): the five files listed above (+ plan/index/changelog).
Out of scope: introducing a new shared `Select`/`Checkbox` component (keep it to className changes on the existing native elements to stay low-risk), any logic/state change, any value/onChange handlers, the public-share password POST behavior.

## Steps
### Step 1: Define a shared select className string locally where convenient, OR inline consistently
For every bare `<select>` above, set the className to a select-appropriate version of the input style (no `placeholder:` needed):
`flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50`
Preserve any width constraints the element already had (e.g. team role select keeps `w-32` instead of `w-full` — use `h-9 w-32 ...` for that one). Do NOT change `value`, `onChange`, `disabled`, or the `<option>` children.

### Step 2: Checkboxes
For each bare `<input type="checkbox">`, add `className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"` (merge with any existing className). Do NOT change `checked`/`onChange`.

### Step 3: password-form.tsx button
Replace the ad-hoc `<button className="w-full bg-primary ...">` with the design-system `Button` (import from `@/components/ui/button`) using `className="w-full"` and keep its existing `type` and any form behavior (it is a submit button inside a form — keep `type="submit"`). If importing Button into this file is awkward (e.g. it's a server component), instead just add `focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2` to the existing button's className and add `type="submit"` if missing. Choose whichever keeps the form working; note which you chose in NOTES.

**Verify**: `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm test` pass. Visually confirm via reading that every targeted `<select>`/checkbox now includes `focus-visible:ring-ring`.

## Done criteria (ALL)
- [ ] Every bare `<select>` in the 5 files has the consistent style incl. `focus-visible:ring-ring`
- [ ] Every bare checkbox has the consistent style
- [ ] password-form button has a focus ring (via Button or className)
- [ ] No value/onChange/logic changed
- [ ] `pnpm typecheck`/`lint`/`test` green
- [ ] Only the 5 source files (+ plan/index/changelog) changed
- [ ] PR opened

## STOP conditions
- Live markup at a cited file diverges so much the control can't be confidently identified → STOP and report which file.
- Changing `password-form.tsx` to use `Button` breaks the build because it's a server component AND adding a focus-ring className also isn't viable → fall back to className-only and continue; only STOP if neither works.
- A verification fails twice after a reasonable fix → STOP.

## Maintenance notes
A future refactor could extract a shared `<Select>`/`<Checkbox>` design-system component; this plan deliberately stays at className level to minimize risk. Reviewer: confirm zero behavior change — only classes/markup wrapper changed.
