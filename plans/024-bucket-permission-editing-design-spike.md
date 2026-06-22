# Plan 024: Design spike — specify editing of bucket permissions (public-access block, bucket policy, object ACLs)

> **Executor instructions**: This is a DESIGN SPIKE, not a build plan. Your
> deliverable is a single design-spec markdown document; you must not modify
> any file under `src/`. Follow the steps in order, run every verification
> command, and honor the STOP conditions. When done, update the status row for
> this plan in `plans/README.md` — unless a reviewer dispatched you and told
> you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d19fb78..HEAD -- src/lib/s3 src/app/api/connections docs/superpowers/specs`
> If `src/lib/s3/security-posture.ts` exists (plan 023 landed), read it before
> writing — your spec's "current state" and write-path build directly on top of
> it. If a spec matching `docs/superpowers/specs/*permission*editing*` or
> `*public-access*` already exists, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M (research + writing; no code)
- **Risk**: LOW (produces a document only) — but the *feature it specifies* is HIGH risk, which is exactly why it gets a spike before any build
- **Depends on**: none to start; the spec should reference plan 023's read
  module (`src/lib/s3/security-posture.ts`) as the read half if 023 has landed
- **Category**: direction / security
- **Planned at**: commit `d19fb78`, 2026-06-22

## Why this matters

Today the app can *detect* effective permissions (the health probes) and —
once plan 023 lands — *display* a bucket's security posture, but it cannot
*change* any S3 permission. The natural next ask ("make this object public and
give me its URL", "lock this bucket down", "edit the bucket policy") is a
genuinely useful bucket-administration feature. It is also the single most
dangerous thing this product could ship: a one-click "make public" button is a
data-exposure footgun, public-access-block silently overrides bucket policy in
non-obvious ways, and providers (AWS / MinIO / R2 / B2) disagree on which APIs
even exist. The `plans/README.md` already flagged object ACL / public-access as
"needs a product call → treat as a design spike, not a build." This spike
produces that decision document: the threat model, the confirmation UX, the
v1 slice, and the provider-compatibility matrix — so that *if* a build plan
follows, it follows a vetted design rather than improvising a public-exposure
surface.

## Current state

- `src/lib/s3/security-posture.ts` — **the read half (plan 023).** If it
  exists, it exposes `readBucketSecurityPosture(client, bucket)` returning
  public-access-block flags, `GetBucketPolicyStatus.IsPublic`, and encryption
  algorithm, plus a `classifyPostureError` helper that maps "not configured" /
  "unsupported" / "denied" S3 errors. The editing feature's UI reads this for
  "current state" and the write actions mutate it. If plan 023 has NOT landed,
  the spec must note that the read endpoint is a prerequisite and reference
  the plan-023 design instead.
- `src/app/api/connections/[id]/buckets/[bucket]/apply-cors/route.ts` — **the
  house pattern for a mutating bucket-config route.** It is the model every
  write route in this spec should follow: `withAuth` + an explicit
  `access.role !== "ADMIN"` → 403 gate, a read-merge-write of bucket config
  (so existing rules are never clobbered), an `AccessDenied` branch that
  returns a 400 with a "do it in the AWS console instead" message, and a
  re-trigger of the health check afterward. Excerpt (lines 30–35, 63–78):
  ```ts
  if (access.role !== "ADMIN") {
    return NextResponse.json({ error: "You do not have permission to update CORS configuration" }, { status: 403 });
  }
  // ... PutBucketCorsCommand with [REQUIRED_RULE, ...existingRules] ...
  if (name === "AccessDenied" || status === 403) {
    return NextResponse.json({ error: "These credentials don't have permission... Apply the config manually..." }, { status: 400 });
  }
  ```
- `src/app/api/buckets/[bucket]/versioning/route.ts` (lines 43–86) — the other
  mutating-config route: ADMIN-gated `PUT`, plus it calls `recordActivity(...)`
  after the change. Any permission mutation MUST likewise write an activity
  record (permission changes are exactly what an audit trail is for).
- `src/lib/health/probes/bucket.ts` (lines 262–292) — the `NoSuchCORSConfiguration`
  → treat-as-empty error-mapping idiom; reuse it for policy/PAB "not configured"
  states. Plan 023's `classifyPostureError` already generalizes this.
- Roles: connections carry an `ADMIN`/`EDITOR`/`VIEWER` role
  (`prisma/schema.prisma:20` `enum TeamRole`); the live gate idiom is
  `access.role !== "ADMIN"`. Permission editing must be **ADMIN-only**; the
  spec must state explicitly whether EDITOR is allowed (recommendation: no).
- Tier gating lives in the subscriptions/gates layer (the lifecycle spike,
  plan 002, references `src/lib/subscriptions/gates.ts`); the spec must take a
  position on whether permission editing is tier-gated.
- House spec format — model the deliverable on
  `docs/superpowers/specs/2026-06-11-cors-health-probe-design.md` and the
  permissions-tab spec `docs/superpowers/specs/2026-06-06-permissions-tab-design.md`:
  header (`# Title`, `**Date:**`, `**Scope:**`), then `## Goal`, `## Changes`
  (numbered, per-file, with code sketches), `## Data Flow`, `## Error States`
  (table), `## Out of Scope`. This spec ADDS a `## Threat model` section
  (see Step 4) — it is the whole point of the spike.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Verify write-side SDK exports | `node -e "const s=require('@aws-sdk/client-s3'); console.log(typeof s.PutPublicAccessBlockCommand, typeof s.PutBucketPolicyCommand, typeof s.DeleteBucketPolicyCommand, typeof s.PutObjectAclCommand, typeof s.GetBucketPolicyCommand)"` (run from repo root) | prints `function` five times |
| Heading check | `grep -n "^## " docs/superpowers/specs/<your-spec-file>.md` | Goal, Threat model, Changes, Data Flow, Error States, Provider compatibility, Open questions, Out of Scope all present |
| Clean tree check | `git status --short` | only the new spec file + `plans/README.md` |
| No source changes | `git diff --stat -- src/` | empty |

## Scope

**In scope** (the only files you may create or modify):
- `docs/superpowers/specs/<YYYY-MM-DD>-bucket-permission-editing-design.md`
  (create; use the current date, matching the existing naming convention)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):
- EVERYTHING under `src/`. No routes, no commands, no UI. This is a document.
- `docs/superpowers/plans/` — the implementation plan comes after spec approval.
- `package.json` / lockfile — no new dependencies for a document.

## Git workflow

- This repo's main checkout is shared by concurrent sessions — run
  `git branch --show-current` before committing.
- Branch: `docs/bucket-permission-editing-spec`. One commit:
  `docs: add bucket permission editing design spec`
  (matches existing `docs: add CORS health probe...` style in git log).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Read the cited code

Read in full: the `apply-cors` route, the `versioning` route, plan 023
(`plans/023-bucket-security-posture-card.md`) and its read module if present
(`src/lib/s3/security-posture.ts`), `src/lib/health/probes/bucket.ts`, and the
exemplar specs `docs/superpowers/specs/2026-06-11-cors-health-probe-design.md`
and `docs/superpowers/specs/2026-06-06-permissions-tab-design.md`.

**Verify**: you can state, in one sentence each, (a) how apply-cors gates on
ADMIN and degrades on AccessDenied, and (b) how the versioning route records an
activity entry after a config change. Both patterns must be reused in your spec.

### Step 2: Confirm the write-side SDK facts

Run the "Verify write-side SDK exports" command → must print `function` five
times. Note in the spec which commands the build will use:
`GetBucketPolicyCommand` (read the raw policy JSON to display/edit),
`PutBucketPolicyCommand` / `DeleteBucketPolicyCommand`,
`PutPublicAccessBlockCommand`, and `PutObjectAclCommand` (object-level
`public-read`).

**Verify**: command prints `function function function function function`.

### Step 3: Research the public-access interaction model

Research (web docs if available; otherwise record each unknown explicitly in
the spec's "Open questions" — do not guess):

- How AWS S3 Public Access Block (account + bucket level) **overrides** bucket
  policy and ACLs. A user could set a public policy and see no effect because
  PAB silently blocks it — the UI must explain this, not just fail.
- Which of {public-access block, bucket policy, bucket ACL, object ACL} each
  provider supports: AWS S3, MinIO, Cloudflare R2, Backblaze B2. Object ACLs
  are deprecated/disabled-by-default on modern AWS buckets (Object Ownership =
  "Bucket owner enforced") — the spec must address what happens when ACLs are
  disabled.
- The standard "make a prefix public" idioms (a bucket-policy `Allow s3:GetObject`
  on `arn:aws:s3:::bucket/prefix/*` vs. per-object `public-read` ACL) and which
  is recommended.

**Verify**: each compatibility claim in the spec is either sourced (doc/link
name) or marked "unverified".

### Step 4: Write the Threat model section (the core deliverable)

This section is why the spike exists. It must cover, at minimum:

- **Exposure footgun**: a write action that makes a bucket/object public is
  irreversible exposure (data may be scraped/indexed before it's undone). Define
  the mitigation: a destructive-action confirmation UX. Recommend
  **type-the-bucket-name-to-confirm** (mirror any existing destructive-confirm
  in the repo — search for one in delete dialogs, e.g.
  `src/components/buckets/delete-bucket-dialog.tsx`, and reuse its pattern), plus
  an explicit "this will make data publicly readable on the internet" warning.
- **Privilege**: ADMIN-only, server-enforced (the `access.role !== "ADMIN"`
  gate is not optional and not client-side). State whether EDITOR is allowed
  (recommend no).
- **Auditability**: every permission mutation writes a `recordActivity` entry
  (who, what, which bucket, when), like the versioning route. Permission
  changes are the highest-value audit events in the app.
- **Blast radius**: editing a raw bucket policy JSON can lock the user out of
  their own bucket or open it wider than intended. Recommend a guarded,
  templated v1 (toggle public/private on a prefix) over a free-form JSON editor;
  if a raw-JSON editor is included, require a parse + a "you may lose access"
  warning.
- **PAB precedence trap**: warn when a user tries to make something public while
  PAB is on (the action will appear to succeed but have no effect), using the
  plan-023 read signals.
- **Misuse as an attack tool**: note that the feature only ever operates with
  credentials the user already supplied for their own connection — it grants no
  access they don't already have — so it is not a new attack surface against
  third parties, only a footgun against the user's own data. State this
  explicitly so reviewers don't over-rotate.

### Step 5: Decide the v1 slice (write this into the spec)

Constraints the recommendation must respect (from the codebase, not taste):

- **Read first, build on plan 023**: the editor's "current state" comes from
  the security-posture read (plan 023). Do not re-implement the reads.
- **Smallest safe write in v1**: recommend **one** guided action, not a
  policy IDE. Candidates to weigh: (a) toggle Public Access Block on/off
  (least data-exposing — turning it *on* is purely protective), (b) a templated
  "make this prefix public / private" bucket-policy edit with confirmation, (c)
  per-object `public-read` ACL toggle. Recommend a v1 and justify it. A defensible
  pick: **PAB toggle + read-only raw policy display** in v1 (protective + visibility),
  deferring any *widening* action (public policy / public-read ACL) to v2 behind
  the full confirmation UX — but take a position with reasoning.
- **Route shape**: mirror apply-cors —
  `PUT /api/connections/[id]/buckets/[bucket]/public-access-block` and (if in
  v1) `/bucket-policy` — `withAuth` + ADMIN gate + read-merge-write +
  AccessDenied→400 + `recordActivity` + re-run security-posture read.
- **RBAC**: ADMIN only; VIEWER/EDITOR read-only.
- **Tier gating**: recommend gated-or-free with one sentence of reasoning.
- **Provider degradation**: where a provider doesn't support a write command,
  the UI must disable the control with a "not supported by this provider"
  explanation (reuse plan 023's `"unsupported"` signal), never show a raw error.

### Step 6: Write the spec

Create `docs/superpowers/specs/<YYYY-MM-DD>-bucket-permission-editing-design.md`
in the house format. Required sections, in order:

1. Header — title, `**Date:**`, `**Scope:**` one-paragraph summary.
2. `## Goal` — the user problem and the explicit risk framing.
3. `## Threat model` — Step 4's content (this is the differentiator).
4. `## Changes` — numbered, per-file: new write route(s) mirroring apply-cors,
   the read dependency on plan 023, the tab/UI surface (recommend whether it
   lives in the existing Permissions tab or a new "Access" tab), query
   hooks/keys, confirmation dialog. Code sketches at the exemplar's fidelity
   (interfaces + key logic, not full implementations).
5. `## Data Flow` — fenced diagram like the exemplar.
6. `## Error States` — table: provider doesn't support the API / AccessDenied
   on write / PAB overrides a public policy / malformed policy JSON / partial
   provider support.
7. `## Provider compatibility` — the matrix from Step 3, unverified cells marked.
8. `## Open questions` — anything unresolved, each phrased as a decidable
   question with your recommended answer.
9. `## Out of Scope` — the v2 deferrals from Step 5 (free-form policy IDE,
   cross-account grants, ACL grants to specific canonical IDs, etc.).

**Verify**: `grep -n "^## " docs/superpowers/specs/<file>.md` shows Goal,
Threat model, Changes, Data Flow, Error States, Provider compatibility, Open
questions, Out of Scope.

### Step 7: Final check

**Verify**:
- `git status --short` → only the new spec file (+ `plans/README.md`)
- `git diff --stat -- src/` → empty (no source changes)

## Test plan

No code, no tests. The verification gates are the heading grep and the
clean-`src/` check above.

## Done criteria

ALL must hold:

- [ ] `docs/superpowers/specs/<YYYY-MM-DD>-bucket-permission-editing-design.md` exists
- [ ] Write-side SDK export check prints `function` five times
- [ ] Heading grep shows all 8 required `##` sections, including `## Threat model`
- [ ] The spec contains a destructive-action confirmation UX recommendation and
      an explicit "ADMIN-only, server-enforced" statement
- [ ] The spec contains a `## Provider compatibility` matrix; every claim is
      sourced or marked "unverified"
- [ ] The spec states the `recordActivity` audit requirement for every mutation
- [ ] `git diff --stat -- src/` is empty
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The write-side SDK export check prints any `undefined` (assumed commands missing).
- A spec matching `docs/superpowers/specs/*permission*` for bucket access /
  public-access / ACLs already exists (someone specced this already).
- The write-side surface in the app already exists (a `Put*` permission route
  appears under `src/app/api` — someone started building; your spec would
  conflict with in-flight work).
- An existing design doc read in Step 1 explicitly rejected or deferred
  permission editing with reasoning — surface that decision instead of
  re-proposing.

## Maintenance notes

- The spec is the deliverable; the follow-up is a human review (this is a
  product+security call, not just an engineering one), then an implementation
  plan in `docs/superpowers/plans/` only if approved.
- This spike pairs with plan 023: 023 ships the read/visibility (low risk,
  build now); 024 decides whether the write/edit side ever ships and how. If
  023 is rejected or reshaped, revisit this spec's read-dependency assumptions.
- If plan 001 (operation metering) has landed, the implementation phase should
  decide whether permission-mutation calls count as metered operations — flag
  it in Open questions either way.
- A reviewer of the eventual *build* plan should treat any control that
  *widens* access (public policy, public-read ACL) as the highest-scrutiny
  diff in the codebase — confirm the confirmation gate and the ADMIN check are
  both server-enforced and cannot be bypassed by calling the route directly.
