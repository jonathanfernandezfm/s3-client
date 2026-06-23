# Plan 035: Design spike — team invitations for users who haven't signed up yet

> **Executor instructions**: This is a DESIGN SPIKE, not a build plan. Your
> deliverable is a single design-spec markdown document; you must not modify any
> file under `src/` or `prisma/`. Follow the steps in order, run every
> verification command, and honor the STOP conditions. When done, update the
> status row for this plan in `plans/README.md` — unless a reviewer dispatched
> you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/app/api/teams prisma/schema.prisma docs/superpowers/specs`
> If `src/app/api/teams/[teamId]/members/route.ts` changed since this plan was
> written, compare the "Current state" excerpt against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M (research + writing; no code)
- **Risk**: LOW (produces a document only)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

Adding a teammate today requires the invitee to **already have an account**.
`POST /api/teams/[teamId]/members` looks the user up by email and returns 404 —
"User not found. They must sign in at least once before being added." So the
real-world onboarding flow ("invite my colleague Jane to the team") is broken:
the admin must out-of-band tell Jane to sign up, wait, then add her. There is no
pending-invite concept, no acceptance flow, no resend/expiry, and no email or
invite-link delivery. This is the single biggest gap in the teams feature.

Why a spike before a build plan: the design hinges on product decisions the
codebase can't answer — chiefly **how the invitee is reached** (the repo has no
transactional-email provider; Clerk owns auth emails only), how pending invites
interact with the **seat cap** (`canAddTeamMember`), and how acceptance ties
into the **Clerk `user.created` webhook**. Deciding these on the fly during
implementation would produce the wrong data model. This spike produces the
decision document; a build plan follows after it's approved.

## Current state

- `src/app/api/teams/[teamId]/members/route.ts` — the add-member route. Relevant
  shape (lines 11-55):
  ```ts
  export const POST = withAuth<RouteContext>(async (req, { user, params }) => {
    const { teamId } = params;
    const canManage = await isTeamAdmin(teamId, user.id);
    if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const memberCheck = await canAddTeamMember(teamId);        // seat cap (plan 001)
    if (!memberCheck.allowed) return NextResponse.json({ error: memberCheck.reason }, { status: 403 });

    const email = body.email?.trim().toLowerCase();
    const role = body.role ?? "VIEWER";
    // ...validates isTeamRole(role)...

    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found. They must sign in at least once before being added." },
        { status: 404 }
      );                                                       // <-- the gap
    }
    // ...409 if already a member, else prisma.teamMember.create(...)...
  });
  ```
- Schema (`prisma/schema.prisma`):
  - `Team` (147-160): `id`, `name`, `slug @unique`, `createdById`, `members`,
    `workspace?`.
  - `TeamMember` (162-176): `id`, `teamId`, `userId`, `role TeamRole @default(VIEWER)`,
    `@@unique([teamId, userId])`, `@@index([userId])`.
  - `TeamRole` enum (find it in the schema; roles are VIEWER / EDITOR / ADMIN —
    confirm in Step 1).
  - There is **no** `Invitation` / `TeamInvite` model.
- `src/lib/db/teams.ts` — `isTeamAdmin(teamId, userId)` and related helpers.
  `src/lib/subscriptions` — `canAddTeamMember(teamId)` (the seat cap from plan
  001; the spec must decide whether a *pending* invite consumes a seat).
- Clerk integration: `src/app/api/webhooks/clerk/route.ts` handles
  `user.created` / `user.updated` / `user.deleted` and on `user.created` creates
  the `User` row + personal workspace + FREE subscription (lines 49-130). This
  is the natural hook for "auto-attach pending invites when the invited email
  signs up" — the spec must take a position on using it.
- **No transactional email provider** is installed — check `package.json`
  dependencies (you will NOT find `resend`, `nodemailer`, `@sendgrid/*`,
  `postmark`). Clerk sends auth emails but the app has no way to send a custom
  "you've been invited" email today. This is the central constraint the spec
  must address (email vs. invite-link vs. auto-match-on-signup).
- Member-removal / role-change live in
  `src/app/api/teams/[teamId]/members/[memberId]/route.ts` (last-admin
  protection is enforced there) — the invite acceptance flow must not bypass
  those invariants.

House spec format & exemplars — model the deliverable on a recent spec, e.g.
`docs/superpowers/specs/2026-06-22-bucket-permission-editing-design.md` and
`docs/superpowers/specs/2026-06-04-subscription-tiers-design.md`. The house
format (see plan 002 and the cors-health-probe spec) is: header (`# Title`,
`**Date:**`, `**Scope:**`), then `## Goal`, `## Changes` (numbered, per-file,
with code sketches), `## Data Flow`, `## Error States` (table), `## Out of
Scope`. Specs are paired with later plans under `docs/superpowers/plans/`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Confirm no email provider | `grep -niE "resend|nodemailer|sendgrid|postmark|mailgun" package.json` | no matches |
| Confirm no invite model | `grep -niE "invitation|teaminvite|invite" prisma/schema.prisma` | no matches (or only unrelated) |
| Heading check | `grep -n "^## " docs/superpowers/specs/<your-spec-file>.md` | required sections present (see Step 4) |
| Clean tree check | `git status --short` | only the new spec file (+ `plans/README.md`) |
| No source changes | `git diff --stat -- src/ prisma/` | empty |

## Scope

**In scope** (the only files you may create or modify):
- `docs/superpowers/specs/2026-06-23-team-invitations-design.md` (create; use
  today's date to match the naming convention)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):
- EVERYTHING under `src/` and `prisma/` — no schema, no routes, no migration.
  The `Invitation` model and routes are *described* in the spec, not created.
- `docs/superpowers/plans/` — the implementation plan comes after spec approval.
- `package.json` / lockfile — choosing an email provider is a recommendation in
  the spec, not an install.

## Git workflow

- Shared checkout — run `git branch --show-current` before committing.
- Branch: `docs/team-invitations-spec`. One commit:
  `docs: add team invitations design spec` (matches existing
  `docs: add ... design spec` messages in git log).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Read the cited code

Read in full: `src/app/api/teams/[teamId]/members/route.ts`,
`src/app/api/teams/[teamId]/members/[memberId]/route.ts`,
`src/app/api/teams/route.ts`, `src/lib/db/teams.ts`, the `Team`/`TeamMember`/
`TeamRole` definitions in `prisma/schema.prisma`, the Clerk webhook
`src/app/api/webhooks/clerk/route.ts`, and the exemplar specs named above. Also
read whatever team-management UI exists under
`src/components/**` (grep for `members`, `team`) so the spec's UI section is
grounded in the real component locations.

**Verify**: you can state in one sentence each: (a) how `canAddTeamMember`
decides the seat cap, (b) how last-admin protection works on member removal, and
(c) what `user.created` does in the Clerk webhook.

### Step 2: Confirm the constraints

1. Run the "no email provider" and "no invite model" grep commands above and
   record both results in the spec (they justify the delivery-mechanism
   decision).
2. Decide and document the **delivery mechanism** — pick one as the v1
   recommendation, with reasoning grounded in the no-email-provider constraint:
   - **(A) Auto-match on signup**: store a pending `Invitation` keyed by email;
     when the invited email signs up (Clerk `user.created` webhook), convert
     pending invites to memberships and surface them in-app. No new infra.
   - **(B) Tokenized invite link**: admin generates a link
     (`/invite/<token>`); the recipient (already signed in or after signing in)
     accepts. Mirrors the existing share-link token pattern
     (`docs/superpowers/specs/2026-06-04-share-links-design.md`).
   - **(C) Email invitation**: add a provider (e.g. Resend) and send a real
     email. Highest effort + a new dependency + deliverability concerns.
   Recommend one (or A+B combined) and list the trade-offs of each.

**Verify**: the grep results are pasted into the spec's constraints section.

### Step 3: Decide the v1 data model and flows (write into the spec)

The recommendation must respect these codebase facts:

- **New `Invitation` model** (sketch the Prisma): at minimum
  `id`, `teamId`, `email` (lowercased), `role TeamRole`, `invitedById`,
  `status` (PENDING/ACCEPTED/REVOKED/EXPIRED), `token?` (if link-based),
  `expiresAt?`, `createdAt`. Add `@@unique([teamId, email])` to prevent
  duplicate pending invites (mirror the `TeamMember @@unique([teamId, userId])`
  pattern). State the migration is additive (new table, no change to existing
  tables).
- **Admin-only creation**: the invite route reuses the `isTeamAdmin` gate and
  the `canAddTeamMember` seat check — and the spec must DECIDE whether a pending
  invite counts toward the seat cap (recommend: yes, count PENDING invites +
  members so a team can't over-invite past its tier; note the alternative).
- **Acceptance**: define exactly how a PENDING invite becomes a `TeamMember`
  without bypassing last-admin / `@@unique([teamId, userId])` invariants. For
  mechanism (A), specify the Clerk `user.created` hook change (convert matching
  PENDING invites). For (B), specify the `POST /api/invites/[token]/accept`
  route and its checks (token valid, not expired, not already a member, seat
  still available at accept time).
- **Lifecycle**: revoke (admin deletes a PENDING invite), resend (regenerate
  token / re-send, with a rate note), expiry (`expiresAt`, default e.g. 7 or 14
  days — recommend one).
- **RBAC + abuse**: only admins invite; tokens (if used) must be unguessable
  (reuse the crypto approach the share-links feature uses — name the file); an
  invite must never grant access to anything beyond team membership at the
  invited `role`.
- **Backward compatibility**: the existing "add an already-registered user"
  path can remain as a fast path, OR be folded into "create an invite that
  auto-accepts when the email is already a user" — take a position.

### Step 4: Write the spec

Create `docs/superpowers/specs/2026-06-23-team-invitations-design.md` in the
house format. Required sections, in order:

1. Header — title, `**Date:** 2026-06-23`, `**Scope:**` one-paragraph summary.
2. `## Goal` — the onboarding gap; quote the current 404 message.
3. `## Constraints` — the no-email-provider and no-invite-model grep results;
   the seat-cap and last-admin invariants that must hold.
4. `## Changes` — numbered, per-file: the `Invitation` Prisma model; new
   routes (`POST /api/teams/[teamId]/invites`, list/revoke, and acceptance per
   the chosen mechanism); the Clerk-webhook change if mechanism (A); UI (where
   the admin sees pending invites, where an invitee accepts). Code sketches at
   the exemplar's fidelity (interfaces + key logic, not full implementations).
5. `## Data Flow` — a fenced diagram: invite created → delivered → accepted →
   membership, including the seat-cap check points.
6. `## Error States` — table: invitee already a member / seat cap reached at
   invite time / seat cap reached at accept time / token expired / token invalid
   / inviting a non-admin actor / duplicate pending invite.
7. `## Open questions` — each phrased as a decidable question with your
   recommended answer (delivery mechanism if not fully settled; expiry duration;
   does a pending invite consume a seat; keep-or-replace the existing add-by-
   email fast path).
8. `## Out of Scope` — explicitly defer: bulk invites, SCIM/SSO provisioning,
   per-resource (not per-team) invitations, and anything the
   `plans/README.md` deferred list already covers (ownership transfer,
   workspace-shared bookmarks — those are separate findings).

**Verify**: `grep -n "^## " docs/superpowers/specs/2026-06-23-team-invitations-design.md`
shows Goal, Constraints, Changes, Data Flow, Error States, Open questions, Out
of Scope.

### Step 5: Final check

**Verify**:
- `git status --short` → only the new spec file (+ `plans/README.md`)
- `git diff --stat -- src/ prisma/` → empty

## Test plan

No code, no tests. The verification gates are the heading grep and the
clean-`src/`/`prisma/` checks above.

## Done criteria

ALL must hold:

- [ ] `docs/superpowers/specs/2026-06-23-team-invitations-design.md` exists
- [ ] Heading grep shows all 7 required `##` sections (Goal, Constraints,
      Changes, Data Flow, Error States, Open questions, Out of Scope)
- [ ] The spec contains an `Invitation` Prisma model sketch with a
      `@@unique([teamId, email])` and a documented seat-cap decision
- [ ] The spec records the two grep results (no email provider, no invite model)
- [ ] The spec takes an explicit position on the delivery mechanism (A/B/C)
- [ ] `git diff --stat -- src/ prisma/` is empty
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- An `Invitation` / `TeamInvite` model already exists in `prisma/schema.prisma`
  (someone started building) — surface it instead of re-specifying.
- A spec matching `docs/superpowers/specs/*invitation*` or `*invite*` already
  exists — surface it.
- `members/route.ts` no longer 404s on an unregistered email (the gap was closed
  another way) — report; the spike's premise may be gone.
- An email provider (`resend`/`nodemailer`/etc.) IS now in `package.json` — note
  it; mechanism (C) becomes viable and the recommendation should change.

## Maintenance notes

- The spec is the deliverable; the follow-up is a human review, then a build
  plan under `docs/superpowers/plans/` (house convention pairs every spec with a
  plan file) and a corresponding `plans/NNN-*.md` implementation plan.
- Cross-references: the `plans/README.md` deferred list also names team
  ownership-transfer and workspace-shared bookmarks/notes as separate teams
  gaps. This spec is invitations only — keep those out of scope but mention them
  in "Out of Scope" so the reviewer sees the boundary.
- If the seat-cap decision is "pending invites consume a seat", the build plan
  must update `canAddTeamMember` to count PENDING invites — flag that as the
  one place the existing subscription logic changes.
