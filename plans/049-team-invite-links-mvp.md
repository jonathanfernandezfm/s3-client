# Plan 049: Team invitation links (MVP) — onboard members who haven't signed up yet

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat c0e3376..HEAD -- prisma/schema.prisma src/app/api/teams src/lib/db/teams.ts src/app/app/teams`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (adds a Prisma migration)
- **Depends on**: none (soft: coordinate with plan 050, which also edits the
  teams page — see Maintenance notes)
- **Category**: direction / feature
- **Planned at**: commit `c0e3376`, 2026-06-23

## Why this matters

The Teams feature (a PRO-gated paid feature) currently has **no way to invite a
colleague who hasn't already signed up**. Adding a member requires the target
user to already exist in the DB:

`src/app/api/teams/[teamId]/members/route.ts:36-42`
```ts
const targetUser = await prisma.user.findUnique({ where: { email } });
if (!targetUser) {
  return NextResponse.json(
    { error: "User not found. They must sign in at least once before being added." },
    { status: 404 }
  );
}
```

So an admin must ask a colleague to independently discover the product, sign up,
log in once, and *then* be added by email — with no in-product prompt telling the
colleague any of this. This blocks the core collaboration loop. This plan ships a
**minimal invite-link MVP**: an admin generates a shareable link tied to a role;
the admin sends it however they like (Slack, email — no email infrastructure is
built); the recipient signs in/up via the existing Clerk flow and, on visiting
the link while authenticated, is added to the team with the invite's role. The
existing "add by email" fast-path for already-registered users stays.

## Current state

### Data model — `prisma/schema.prisma`
```prisma
model Team {
  id          String       @id @default(uuid())
  name        String
  slug        String       @unique
  createdById String
  createdBy   User         @relation("TeamCreator", fields: [createdById], references: [id], onDelete: Cascade)
  members     TeamMember[]
  workspace   Workspace?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  @@map("teams")
}

model TeamMember {
  id     String   @id @default(uuid())
  teamId String
  userId String
  role   TeamRole @default(VIEWER)
  team   Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user   User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([teamId, userId])
  @@index([userId])
  @@map("team_members")
}

enum TeamRole { ADMIN  EDITOR  VIEWER }
```
There is **no** `Invitation`/`TeamInvitation` model (confirmed:
`grep -n "model Invitation\|model TeamInvitation" prisma/schema.prisma` → nothing).

### Existing helpers
- `src/lib/db/teams.ts`:
  ```ts
  export async function getTeamMembership(teamId, userId) { ... }   // returns TeamMember | null
  export async function isTeamAdmin(teamId, userId): Promise<boolean> { ... }
  ```
- Seat-cap check: `src/lib/subscriptions/check-limits.ts:127` —
  `canAddTeamMember(teamId)` counts `team._count.members` against
  `TIER_LIMITS[tier].teams.maxMembersPerTeam`. **Reuse this at accept time.**
- Auth wrapper: `withAuth` (`src/lib/auth/protect.ts`) injects `{ user, params }`;
  `user.id` is the internal `User.id`. It auto-creates the `User` row on first
  authenticated request if Clerk has them but the DB doesn't (lines 35-80) — so a
  freshly-signed-up invitee will have a `User` row by the time the accept route
  runs.
- Token generation convention: `src/lib/share-links/slug.ts` uses
  `crypto.randomBytes` over an alphabet:
  ```ts
  export const SLUG_ALPHABET = "0123456789ABC...xyz"; // 62 chars
  export const SLUG_LENGTH = 8;
  export function generateSlug(): string { /* randomBytes(8) -> 8 chars */ }
  ```
  Mirror this for invite tokens but use **32 chars** (invite tokens are
  bearer secrets — they must be unguessable).

### Existing add-member route (the fast-path to preserve)
`src/app/api/teams/[teamId]/members/route.ts` — POST, ADMIN-gated via
`isTeamAdmin`, runs `canAddTeamMember`, validates role with `isTeamRole`, rejects
duplicates with 409. Leave this route working as-is.

### Teams page UI
`src/app/app/teams/page.tsx` is the master-detail Teams page (`TeamsContent`).
`src/components/teams/team-members-card.tsx` renders the member list + the
ADMIN-only "add by email" form. Notifications use
`useNotificationStore().addNotification({ type, title, description, status })`
(see existing handlers in `teams/page.tsx:59-138`).

### Conventions
- API routes: `withAuth` / `withAuth<RouteContext>`; `params` is awaited inside
  the wrapper and handed to the handler already-resolved.
- Role validation: `isTeamRole(value)` from `src/lib/roles.ts`.
- Public app route group for authenticated pages: `src/app/app/...`.
- Path alias `@/*` → `src/*`.

## Commands you will need

| Purpose            | Command                                                        | Expected |
|--------------------|---------------------------------------------------------------|----------|
| Create migration   | `pnpm prisma migrate dev --name add_team_invitations --create-only` | writes SQL, does not apply |
| Apply + regenerate | `pnpm prisma migrate dev`                                      | applies, regenerates client |
| Generate client    | `pnpm prisma generate`                                         | regenerates `src/generated/prisma` |
| Typecheck          | `pnpm typecheck`                                               | exit 0 |
| Lint               | `pnpm lint`                                                    | exit 0 |
| Tests              | `pnpm test -- invite`                                          | new tests pass |
| Full test          | `pnpm test`                                                    | all pass |

> **DB note**: `prisma migrate dev` needs a reachable `DATABASE_URL`. If no dev
> database is available in your environment, see STOP conditions — do not invent
> credentials.

## Scope

**In scope**:
- `prisma/schema.prisma` (add `TeamInvitation` model + relation fields)
- `prisma/migrations/<generated>/migration.sql` (generated)
- `src/lib/teams/invite-token.ts` (create)
- `src/lib/db/team-invitations.ts` (create — query helpers)
- `src/app/api/teams/[teamId]/invites/route.ts` (create — POST create, GET list)
- `src/app/api/teams/[teamId]/invites/[inviteId]/route.ts` (create — DELETE revoke)
- `src/app/api/teams/invites/[token]/route.ts` (create — GET preview)
- `src/app/api/teams/invites/[token]/accept/route.ts` (create — POST accept)
- `src/lib/queries/teams.ts` (add invite hooks)
- `src/components/teams/team-members-card.tsx` (add "Create invite link" UI)
- `src/app/app/teams/join/[token]/page.tsx` (create — accept landing page)
- Test files alongside the routes/helpers (create)

**Out of scope** (do NOT touch):
- The existing `members` routes (`.../members/route.ts`,
  `.../members/[memberId]/route.ts`) — the add-by-email and role/remove flows
  stay exactly as they are.
- `Team.slug` — leave it; this plan uses a new opaque token, not the slug.
- No email-sending integration, no Clerk webhook changes. The invitee is added
  when they **visit the link while authenticated**, not via a webhook.
- Billing / tier-gate logic beyond calling the existing `canAddTeamMember`.

## Git workflow

- Branch: `advisor/049-team-invite-links-mvp`
- Conventional commits, e.g.:
  - `feat: add TeamInvitation model and migration`
  - `feat: add team invite-link create/accept routes`
  - `feat: surface invite-link UI on the teams page`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the `TeamInvitation` model

In `prisma/schema.prisma`, add:

```prisma
model TeamInvitation {
  id          String    @id @default(uuid())
  teamId      String
  team        Team      @relation(fields: [teamId], references: [id], onDelete: Cascade)
  role        TeamRole  @default(VIEWER)
  token       String    @unique
  email       String?   // optional hint; the link works for whoever opens it
  createdById String
  createdBy   User      @relation("TeamInvitationCreator", fields: [createdById], references: [id], onDelete: Cascade)
  acceptedById String?
  acceptedBy   User?    @relation("TeamInvitationAcceptor", fields: [acceptedById], references: [id], onDelete: SetNull)
  acceptedAt  DateTime?
  revokedAt   DateTime?
  expiresAt   DateTime
  createdAt   DateTime  @default(now())

  @@index([teamId])
  @@map("team_invitations")
}
```

Add the back-relations on the existing models:
- On `Team`: `invitations TeamInvitation[]`
- On `User`: add two relation fields —
  `createdInvitations TeamInvitation[] @relation("TeamInvitationCreator")` and
  `acceptedInvitations TeamInvitation[] @relation("TeamInvitationAcceptor")`

**Verify**: `pnpm prisma migrate dev --name add_team_invitations --create-only`
generates a `migration.sql` under `prisma/migrations/`. Open it and confirm it
`CREATE TABLE "team_invitations"` with the expected columns and the unique index
on `token`. Then `pnpm prisma migrate dev` to apply + regenerate, and
`pnpm typecheck` → exit 0.

### Step 2: Invite token generator

Create `src/lib/teams/invite-token.ts`, mirroring `src/lib/share-links/slug.ts`
but length 32:

```ts
import { randomBytes } from "crypto";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const INVITE_TOKEN_LENGTH = 32;

export function generateInviteToken(): string {
  const bytes = randomBytes(INVITE_TOKEN_LENGTH);
  let out = "";
  for (let i = 0; i < INVITE_TOKEN_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export const INVITE_TTL_DAYS = 7;
```

**Verify**: add `src/lib/teams/invite-token.test.ts` (model after
`src/lib/share-links/slug.test.ts`): token length is 32, only alphabet chars,
1000 generated tokens are all unique. `pnpm test -- invite-token` → pass.

### Step 3: DB helpers

Create `src/lib/db/team-invitations.ts` with:
- `createInvitation({ teamId, role, email, createdById })` — generates a token,
  sets `expiresAt = now + INVITE_TTL_DAYS`, inserts, returns the row.
- `listPendingInvitations(teamId)` — returns invites where `acceptedAt` is null,
  `revokedAt` is null, `expiresAt > now`, ordered by `createdAt desc`.
- `getInvitationByToken(token)` — returns the row with `team` included (for the
  preview), or null.
- `revokeInvitation(inviteId)` — sets `revokedAt = now`.

Use `prisma` from `@/lib/db/prisma` (default import), matching `src/lib/db/teams.ts`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Admin routes — create & list invites

Create `src/app/api/teams/[teamId]/invites/route.ts`:
- `POST` (`withAuth<RouteContext>`): gate with `isTeamAdmin(teamId, user.id)` →
  403 if not. Run `canAddTeamMember(teamId)` → 403 with `reason` if seat cap
  reached (so an admin can't mint links beyond their plan). Parse body
  `{ role?: TeamRole, email?: string }`, default role `VIEWER`, validate with
  `isTeamRole`. Create the invite via `createInvitation`. Return
  `{ id, role, token, url, expiresAt }` where `url` is built from the request
  host like `src/app/api/share-links/route.ts:23-27` does:
  ```ts
  const host = req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const url = `${proto}://${host}/app/teams/join/${token}`;
  ```
- `GET` (`withAuth<RouteContext>`): gate with `isTeamAdmin` → 403; return
  `listPendingInvitations(teamId)` mapped to `{ id, role, email, url, expiresAt, createdAt }`.

Create `src/app/api/teams/[teamId]/invites/[inviteId]/route.ts`:
- `DELETE` (`withAuth`): gate with `isTeamAdmin`; verify the invite belongs to
  `teamId` (404 otherwise); `revokeInvitation`; return `{ success: true }`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 5: Public-to-member routes — preview & accept

Create `src/app/api/teams/invites/[token]/route.ts`:
- `GET` (`withAuth` — any authenticated user): look up via `getInvitationByToken`.
  Return 404 if missing. Compute status: if `revokedAt` set → 410 `{ error: "This invite has been revoked" }`;
  if `acceptedAt` set → 410 `{ error: "This invite has already been used" }`;
  if `expiresAt < now` → 410 `{ error: "This invite has expired" }`. Otherwise
  return `{ teamId, teamName: invite.team.name, role }` for the join page to
  display. **Do not** add the member here (GET must not mutate).

Create `src/app/api/teams/invites/[token]/accept/route.ts`:
- `POST` (`withAuth`): look up the invite. Re-validate not-revoked /
  not-accepted / not-expired (same 410s). Then, in a `prisma.$transaction`:
  1. If the user is **already** a member of `invite.teamId`
     (`getTeamMembership`), mark the invite accepted (`acceptedAt`,
     `acceptedById = user.id`) and return `{ teamId, alreadyMember: true }`
     (idempotent — re-clicking the link is harmless).
  2. Else run `canAddTeamMember(invite.teamId)`; if not allowed, return 403 with
     the `reason` (the team may have filled up since the link was minted).
  3. Else create the `TeamMember` `{ teamId, userId: user.id, role: invite.role }`
     and mark the invite accepted. Return `{ teamId, role }`.
- Use the unique constraint `@@unique([teamId, userId])` as the race guard:
  wrap the create in try/catch and treat a unique-violation as "already a
  member" → accepted, idempotent.

**Verify**: `pnpm typecheck` → exit 0.

### Step 6: Query hooks

In `src/lib/queries/teams.ts`, add (matching the existing fetch/hook style in
that file):
- `useTeamInvites(teamId)` → GET `/api/teams/${teamId}/invites`
- `useCreateInvite(teamId)` → POST `/api/teams/${teamId}/invites`, invalidates the
  invites query on success
- `useRevokeInvite(teamId)` → DELETE `/api/teams/${teamId}/invites/${inviteId}`,
  invalidates on success

Extend `teamKeys` with `invites: (teamId) => [...teamKeys.all, "invites", teamId]`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 7: Invite UI on the members card

In `src/components/teams/team-members-card.tsx`, inside the `canManage` block,
add a "Create invite link" control (a button + role selector, or reuse the
existing role `<select>` state). On click, call `useCreateInvite`, then show the
returned `url` in a read-only field with a Copy button (use the same
notification-on-copy pattern the app uses elsewhere). Below it, render
`useTeamInvites(teamId)` as a small "Pending invites" list, each with role,
relative expiry, and a Revoke button wired to `useRevokeInvite`.

Keep the existing "add by email" form — invites are **additive**.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 8: Join landing page

Create `src/app/app/teams/join/[token]/page.tsx` (client component). On mount:
- GET the preview (`/api/teams/invites/${token}`). While loading, show a spinner
  (`Loader2`, as in `teams/page.tsx`). On a non-OK preview, show the error
  message (revoked/expired/used) with a link back to `/app/teams`.
- On a valid preview, show "You've been invited to **{teamName}** as {role}" and
  an "Accept invite" button that POSTs to `/api/teams/invites/${token}/accept`,
  then on success `router.push("/app/teams")` and an `addNotification` success
  toast. If the user is unauthenticated, Clerk's existing middleware/route
  protection sends them through sign-in and back (the route is under `/app`, the
  protected group) — no extra handling needed.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 9: Full gate

**Verify**: `pnpm typecheck && pnpm lint && pnpm test` → all exit 0.

## Test plan

Write route/helper tests (model after existing route tests like
`src/app/api/objects/delete/route.test.ts` and the helper test style in
`src/lib/share-links/slug.test.ts`):

- `src/lib/teams/invite-token.test.ts` — length, alphabet, uniqueness (Step 2).
- Accept-flow logic tests covering:
  - Non-member + valid invite → member created with the invite's role, invite
    marked accepted.
  - Already-member + valid invite → idempotent, no duplicate member, invite
    marked accepted, `alreadyMember: true`.
  - Revoked / expired / already-accepted invite → 410.
  - Seat cap reached at accept time → 403 with reason, no member created.
  - Non-admin calling create-invite → 403.
- If the existing route tests mock Prisma, follow that mocking pattern; if they
  hit a test DB, follow that. **Match whatever `objects/delete/route.test.ts`
  does — do not introduce a new test infrastructure.**

Verification: `pnpm test -- invite` → all new tests pass; `pnpm test` → green.

## Done criteria

ALL must hold:

- [ ] `pnpm prisma generate` clean; `team_invitations` table exists in a
      generated migration under `prisma/migrations/`
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0; new invite tests exist and pass (token + accept-flow
      cases above)
- [ ] The existing add-by-email route is unchanged
      (`git diff c0e3376..HEAD -- src/app/api/teams/[teamId]/members/route.ts` empty)
- [ ] A non-admin gets 403 from POST/GET/DELETE on the invite routes
- [ ] GET preview does not mutate (no member created on preview)
- [ ] Accepting twice does not create a duplicate member
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- No reachable dev `DATABASE_URL` is available, so `prisma migrate dev` cannot
  run. Report this — do NOT fabricate a connection string. (Fallback the
  operator may approve: hand-author the migration SQL following the existing
  `prisma/migrations/*/migration.sql` style and run `prisma generate` only.)
- The existing route tests use a test-DB/mocking approach you cannot reproduce —
  report rather than inventing a parallel harness.
- `canAddTeamMember` or `isTeamAdmin` signatures differ from the excerpts above
  (drift) — re-read them before wiring.
- You find an existing `TeamInvitation`/invite route already present (drift —
  this plan assumes none exists).
- The accept flow would require editing the Clerk webhook or middleware —
  it should not; if it seems to, stop and report (the design intentionally
  avoids webhook coupling).

## Maintenance notes

- **Coordinates with plan 050** (Teams UX polish): both edit
  `src/components/teams/team-members-card.tsx` and the teams page. Land whichever
  is ready first; the second executor must re-run its drift check and rebase the
  shared file. If 050 already landed, the role `<select>` is already styled —
  reuse it for the invite role picker.
- Deferred (explicitly NOT in this MVP, by the operator's "minimal" choice):
  email delivery of invites, email-bound invites that reject a mismatched
  recipient, resend, and Clerk `user.created` auto-attach. The `email` column is
  stored as a hint to enable these later without another migration.
- Reviewer should scrutinize the accept route's idempotency (the unique-violation
  race guard) and that the seat cap is re-checked at accept time, not only at
  mint time.
- Security note for the reviewer: the token is a 32-char bearer secret over a
  62-char alphabet (~190 bits) and expires in 7 days; the preview/accept routes
  are auth-gated, so only signed-in users can act on a link. Confirm tokens are
  never logged.
