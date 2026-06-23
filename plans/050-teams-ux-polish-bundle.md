# Plan 050: Teams UX polish — styled role select, rename/delete/leave, declutter, hide "coming soon"

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. Each sub-task (A–E) is independent — you may land them in separate
> commits. If anything in the "STOP conditions" section occurs, stop and report.
> When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat c0e3376..HEAD -- src/components/teams src/app/app/teams src/app/api/teams src/components/landing/video-modal.tsx src/components/buckets/bucket-detail-tabs.tsx`
> If any in-scope file changed, compare the "Current state" excerpts to live
> code before editing; on a mismatch, treat it as a STOP condition for that
> sub-task only.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (sub-task C adds two small ADMIN-gated routes)
- **Depends on**: none (soft: coordinate with plan 049 on the shared
  `team-members-card.tsx` — see Maintenance notes)
- **Category**: ux / tech-debt
- **Planned at**: commit `c0e3376`, 2026-06-23

## Why this matters

The Teams feature works but has rough edges that read as unfinished before a
public launch:
1. The add-member **role picker is a bare native `<select>`** with no styling —
   inconsistent with the rest of the Radix/Tailwind UI.
2. A team, once created, **cannot be renamed, deleted, or left** — there is no
   such UI or route. A user who fat-fingers a team name is stuck with it
   forever, and there's no way to clean up.
3. The create-team dialog exposes a **"Slug (optional)" field** that has no
   user-facing purpose (no route uses `Team.slug`) — it's confusing clutter.
4. Two **"coming soon"** placeholders are reachable by users (a lifecycle tab and
   a demo-video fallback).

Each is small; together they make Teams feel finished. Sub-tasks are independent.

## Current state

### A — bare role `<select>`
`src/components/teams/team-members-card.tsx:79-91`:
```tsx
<div className="space-y-2">
  <Label htmlFor="member-role">Role</Label>
  <select
    id="member-role"
    value={role}
    onChange={(e) => setRole(e.target.value as Role)}
    className="h-9 w-full"
  >
    <option value="VIEWER">Viewer</option>
    <option value="EDITOR">Editor</option>
    <option value="ADMIN">Admin</option>
  </select>
</div>
```
The shared `Input` (`src/components/ui/input.tsx`) is the styling reference for
form controls in this repo. There is **no** `src/components/ui/select.tsx`
(confirmed) — do not assume a Radix Select primitive exists.

### B — create-team dialog has an unused slug field
`src/components/teams/create-team-dialog.tsx:90-98`:
```tsx
<div className="space-y-2">
  <Label htmlFor="team-slug">Slug (optional)</Label>
  <Input id="team-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="platform-team" />
</div>
```
The POST `/api/teams` route auto-generates a slug from the name when none is
provided (`src/app/api/teams/route.ts:87` → `slugify(body.slug?.trim() || name)`),
so the field is safe to remove from the UI — the backend still produces a slug.

### C — no rename / delete / leave
- `src/app/api/teams/[teamId]/route.ts` currently has **only** a `GET` handler
  (returns team + members). No `PATCH` (rename) or `DELETE` (delete team).
- Leaving a team = deleting your own `TeamMember`. The member route
  `src/app/api/teams/[teamId]/members/[memberId]/route.ts` `DELETE` already
  exists and already enforces last-admin protection (`countAdmins <= 1` → 400),
  but it is **ADMIN-gated** (`isTeamAdmin` required), so a VIEWER/EDITOR cannot
  remove themselves. A "leave" needs to allow a member to delete **their own**
  membership.
- `src/lib/db/teams.ts` has `getTeamMembership` and `isTeamAdmin`.
- The Teams page header that would host these actions:
  `src/app/app/teams/page.tsx:215-222` (the `<Card>` showing `team.name` + role).

### D + E — "coming soon" placeholders
- `src/components/landing/video-modal.tsx:31-34` — shows "Demo video coming soon."
  only as an `onError` fallback when `/demo/showcase.{webm,mp4}` are missing.
- `src/components/buckets/bucket-detail-tabs.tsx:129-134` — a whole `lifecycle`
  tab renders `<ComingSoonTab title="Lifecycle rules coming soon" .../>`.

### Conventions
- Notifications: `useNotificationStore().addNotification({ type, title, description, status })`.
- Mutations: TanStack Query hooks in `src/lib/queries/teams.ts` (see
  `useCreateTeam`, `useRemoveTeamMember` for the pattern; invalidate
  `teamKeys.all` / `["workspaces"]`).
- API routes: `withAuth<RouteContext>`, ADMIN gate via `isTeamAdmin`.
- Confirm-before-destroy: deletes elsewhere use a dialog (e.g. the sidebar
  connection delete). A team delete must require confirmation.

## Commands you will need

| Purpose   | Command                 | Expected |
|-----------|-------------------------|----------|
| Typecheck | `pnpm typecheck`        | exit 0   |
| Lint      | `pnpm lint`             | exit 0   |
| Tests     | `pnpm test -- teams`    | pass     |
| Full test | `pnpm test`             | all pass |

## Scope

**In scope**:
- `src/components/teams/team-members-card.tsx` (A)
- `src/components/teams/create-team-dialog.tsx` (B)
- `src/app/api/teams/[teamId]/route.ts` (C — add PATCH + DELETE)
- `src/app/api/teams/[teamId]/members/[memberId]/route.ts` (C — allow self-leave)
- `src/lib/queries/teams.ts` (C — add rename/delete/leave hooks)
- `src/app/app/teams/page.tsx` (C — header actions + handlers)
- `src/components/landing/video-modal.tsx` (D)
- `src/components/buckets/bucket-detail-tabs.tsx` (E)
- Test files alongside changed routes (create/update)

**Out of scope** (do NOT touch):
- `Team.slug` in `prisma/schema.prisma` — keep the column and backend
  auto-generation; only the **UI field** is removed. No migration.
- The add-by-email member flow logic (only the `<select>` styling changes).
- The existing last-admin protection in the member DELETE — preserve it exactly.

## Git workflow

- Branch: `advisor/050-teams-ux-polish`
- Commit per sub-task, conventional style, e.g.:
  - `fix: style the team role select`
  - `feat: add team rename, delete, and leave`
  - `chore: remove unused slug field from create-team dialog`
  - `chore: hide lifecycle "coming soon" tab`
- Do NOT push or open a PR unless instructed.

## Steps

### Step A: Style the role `<select>`

Replace the `className="h-9 w-full"` on the `<select>` at
`team-members-card.tsx:84` with classes matching the shared `Input`. Open
`src/components/ui/input.tsx`, copy its class string, and apply it to the
`<select>` (drop input-only bits like `file:`). Target shape:

```tsx
className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
```

Use whatever the live `input.tsx` actually defines (it is the source of truth —
do not hardcode the above if it differs). Keep the three `<option>`s.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step B: Remove the slug field from the create-team dialog

In `create-team-dialog.tsx`, delete the slug `<div>` block (lines ~90-98) and the
now-unused `slug` state + its reset. In `handleSubmit`, call
`onCreate({ name: name.trim() })` (drop the `slug` property). The POST route
still auto-generates a slug from the name, so behavior is unchanged for users.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0; `grep -n "slug" src/components/teams/create-team-dialog.tsx` → no matches.

### Step C: Rename / delete / leave

**C1 — API: rename + delete team.** In
`src/app/api/teams/[teamId]/route.ts`, add:
- `PATCH` (`withAuth<RouteContext>`): gate with `isTeamAdmin(teamId, user.id)` →
  403; parse `{ name?: string }`, trim, reject empty with 400; `prisma.team.update`
  the name; return `{ id, name }`.
- `DELETE` (`withAuth<RouteContext>`): gate so that **only the team creator**
  may delete (load the team, compare `team.createdById === user.id`; 403
  otherwise). `prisma.team.delete` — the schema cascades remove members,
  workspace, and the workspace's connections (`onDelete: Cascade`). Return
  `{ success: true }`.

> Deleting a team deletes its connections. Make the UI confirmation explicit
> about this (Step C3).

**C2 — API: allow self-leave.** In
`src/app/api/teams/[teamId]/members/[memberId]/route.ts` `DELETE`, currently the
handler requires `isTeamAdmin`. Change the gate so the action is allowed when
**either** the caller is a team admin **or** the caller is removing their own
membership. Concretely: load the target `member`; permit if
`isTeamAdmin(teamId, user.id)` OR `member.userId === user.id`. Keep the existing
`member.teamId !== teamId` 404 check and the **last-admin protection** exactly as
is (a sole admin still cannot leave — they get the existing 400; that is correct,
they must delete the team or promote someone first).

**C3 — Hooks.** In `src/lib/queries/teams.ts` add `useRenameTeam(teamId)`,
`useDeleteTeam()`, and `useLeaveTeam(teamId)` (leave = DELETE
`/api/teams/${teamId}/members/${ownMemberId}` — the page knows the current
user's `memberId` from `team.members`; pass it in). Invalidate `teamKeys.all`
and `["workspaces"]` on success (match `useCreateTeam`).

**C4 — UI.** In `src/app/app/teams/page.tsx`, in the team header card
(lines 215-222), add an actions menu (reuse `DropdownMenu` from
`@/components/ui/dropdown-menu`, as `team-members-card.tsx` already does) with:
- **Rename** (ADMIN only) → inline edit or a small dialog; on submit call
  `useRenameTeam`.
- **Delete team** (creator only — you can tell from `team.role === "ADMIN"`
  plus a creator check; if the API returns 403 for non-creators, surface the
  error) → confirmation dialog whose copy states "This permanently deletes the
  team and all its connections." On confirm, call `useDeleteTeam`, then clear
  `selectedTeamId` and show a notification.
- **Leave team** (any member) → confirmation, call `useLeaveTeam`. On the
  last-admin 400, surface the returned error message via `addNotification`.

After delete/leave, reset selection (`setSelectedTeamId(null)`) so the page
falls back to the empty/first-team state.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0; route tests in Step "Test plan" pass.

### Step D: Demo-video placeholder

Decide with the simplest safe option: since the "coming soon" text only appears
when the demo assets are absent, check `public/demo/` for `showcase.webm` /
`showcase.mp4`. 
- If the assets are **missing**, hide the "Watch demo" entry point on the
  landing page so users never reach the fallback. Find the trigger that opens
  `VideoModal` (grep `VideoModal` / `setVideoOpen` under `src/components/landing/`)
  and conditionally not render it, OR change the fallback copy from
  "Demo video coming soon." to a neutral line. Prefer hiding the trigger.
- If the assets **exist**, do nothing — the real video plays.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0. Note in your report which
branch you took.

### Step E: Lifecycle "coming soon" tab

In `src/components/buckets/bucket-detail-tabs.tsx`, the `lifecycle` tab renders a
`ComingSoonTab`. Remove the **tab trigger** for `lifecycle` from the tab bar so
users can't navigate to it (find where the tab list/triggers are defined in this
file — above line 110 — and drop the lifecycle entry), and remove the
`activeTab === "lifecycle"` panel block (lines 129-134). Leave the `permissions`,
`overview`, and `multipart` tabs intact. If `ComingSoonTab` becomes unused after
this, remove its now-dead import.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0;
`grep -n "lifecycle" src/components/buckets/bucket-detail-tabs.tsx` → no matches.

### Step F: Full gate

**Verify**: `pnpm typecheck && pnpm lint && pnpm test` → all exit 0.

## Test plan

- **Sub-task C** is the only one with logic worth testing. Add/extend tests for
  `src/app/api/teams/[teamId]/route.ts` and the member DELETE, modeled after the
  existing route test style (e.g. `src/app/api/objects/delete/route.test.ts`):
  - PATCH rename by an admin succeeds; by a non-admin → 403; empty name → 400.
  - DELETE team by the creator succeeds; by a non-creator admin → 403.
  - Member DELETE: a VIEWER can remove **their own** membership (leave); a
    VIEWER cannot remove **another** member → 403; the **sole admin** leaving →
    400 (last-admin protection preserved).
- Sub-tasks A, B, D, E are presentational — no unit tests; verify via typecheck +
  lint + a manual smoke note for the reviewer.
- Verification: `pnpm test -- teams` → all pass; `pnpm test` → green.

## Done criteria

ALL must hold:

- [ ] Role `<select>` uses the shared input styling (border/rounded/focus ring)
- [ ] `grep -n "slug" src/components/teams/create-team-dialog.tsx` → no matches
- [ ] `Team.slug` column still exists in `prisma/schema.prisma` (NOT removed)
- [ ] PATCH (rename) and DELETE (delete) exist on `teams/[teamId]/route.ts`,
      ADMIN/creator-gated respectively
- [ ] A non-admin member can leave; the sole admin still cannot (existing 400)
- [ ] Last-admin protection in the member DELETE is unchanged in behavior
- [ ] No reachable "coming soon" lifecycle tab; demo-video fallback not reachable
      (or neutral copy), per Step D/E
- [ ] `pnpm typecheck && pnpm lint && pnpm test` all exit 0; new team route tests pass
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `src/components/ui/input.tsx` doesn't exist or has no class string to copy
  (drift) — report rather than inventing styles.
- The member DELETE handler's structure differs materially from the excerpt
  (the last-admin guard moved/changed) — re-read before editing; do not weaken
  the guard.
- Removing the lifecycle tab leaves dangling references elsewhere
  (`grep -rn "lifecycle" src/components/buckets`) you can't resolve within scope.
- Sub-task C's team DELETE cascade would remove connections the operator may not
  expect — if unsure whether cascade-delete-of-connections is desired, land
  A/B/D/E and report C for confirmation.

## Maintenance notes

- **Coordinates with plan 049** (invite links): both edit
  `team-members-card.tsx` and the teams page. Whichever lands second must re-run
  its drift check and rebase the shared files. If 049 already added an invite
  role picker, reuse the styled `<select>` from sub-task A for it.
- The slug column is intentionally retained (it's `@unique` and removing it is a
  migration with no upside). If a future feature needs human-readable team URLs
  or invite slugs, the column is already there.
- Reviewer should scrutinize: the team DELETE cascade (it removes connections),
  the self-leave authorization change (must not let a member remove *others*),
  and that last-admin protection still returns 400.
- Deferred: a full "team settings" page (avatar, default role, transfer
  ownership) is out of scope; this plan only adds rename/delete/leave to the
  existing header.
