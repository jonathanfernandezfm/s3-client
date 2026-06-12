# Plan 002: Design spike — specify the Lifecycle rules feature behind the bucket-detail "coming soon" tab

> **Executor instructions**: This is a DESIGN SPIKE, not a build plan. Your
> deliverable is a single design-spec markdown document; you must not modify
> any file under `src/`. Follow the steps in order, run every verification
> command, and honor the STOP conditions. When done, update the status row
> for this plan in `plans/README.md` — unless a reviewer dispatched you and
> told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a4acb59..HEAD -- src/components/buckets/bucket-detail-tabs.tsx src/lib/health/probes docs/superpowers/specs`
> If `bucket-detail-tabs.tsx` changed since this plan was written, compare the
> "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M (research + writing; no code)
- **Risk**: LOW (produces a document only)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `a4acb59` (branch `tags`), 2026-06-12

## Why this matters

The shipped bucket-detail page promises lifecycle rules to every user: the
"Lifecycle rules" tab renders a ComingSoonTab that reads "Configure
auto-deletion, storage-class transitions, and auto-aborting of incomplete
uploads." (`src/components/buckets/bucket-detail-tabs.tsx:97-102`). There is
no backing code anywhere in `src/` — no API route, no S3 commands, no design
spec in `docs/superpowers/specs/`. Every other tab on that page is real. A
visible in-product promise with no design is the highest-confidence direction
signal in this repo; the blocker is that lifecycle behavior differs across
S3-compatible providers (AWS vs MinIO vs others), so scope must be decided
before anyone builds. This spike produces the decision document.

## Current state

- `src/components/buckets/bucket-detail-tabs.tsx` — the bucket detail page's
  tab bar. `TAB_DEFINITIONS` (lines 13–18) declares
  `{ key: "lifecycle", label: "Lifecycle rules", icon: Repeat }`, and lines
  97–102 render:
  ```tsx
  {activeTab === "lifecycle" && (
    <ComingSoonTab
      title="Lifecycle rules coming soon"
      description="Configure auto-deletion, storage-class transitions, and auto-aborting of incomplete uploads."
    />
  )}
  ```
  Sibling tabs are real implementations: `OverviewTab`, `MultipartUploadsTab`
  (lists incomplete multipart uploads; ADMIN-only abort via
  `canAbort = connection?.role === "ADMIN"`, line 39), `PermissionsTab`.
- `src/components/buckets/coming-soon-tab.tsx` — the placeholder component.
- `src/components/buckets/multipart-uploads-tab.tsx` — closest sibling
  feature: the spec's "auto-abort incomplete uploads" lifecycle rule directly
  complements this tab.
- `src/lib/health/probes/bucket.ts` — the bucket health-probe registry
  (~12 probes). Capability detection for provider differences already has a
  house pattern here: e.g. `GetBucketVersioningCommand` probes at lines
  197/216 and `GetBucketCorsCommand` at line 271, mapping S3 errors to
  `granted`/`denied`/`error` results stored per bucket.
- `src/app/api/connections/[id]/buckets/[bucket]/apply-cors/route.ts` — the
  house pattern for a **mutating bucket-config route with a one-click Fix**:
  `withAuth` + ADMIN role check, read-merge-write of bucket config, then
  re-trigger the health check. A "create lifecycle rule" route should follow
  this shape.
- House spec format — model the deliverable on
  `docs/superpowers/specs/2026-06-11-cors-health-probe-design.md`: header
  (`# Title`, `**Date:**`, `**Scope:**`), then `## Goal`, `## Changes`
  (numbered, per-file, with code sketches), `## Data Flow`, `## Error States`
  (table of scenario → user sees), `## Out of Scope`.
- Dependency facts: `@aws-sdk/client-s3` ^3.700.0 is installed and exports
  `GetBucketLifecycleConfigurationCommand`,
  `PutBucketLifecycleConfigurationCommand`, and
  `DeleteBucketLifecycleCommand` (verify in step 2 — do not take this plan's
  word for it).
- Tier context: feature gating lives in `src/lib/subscriptions/gates.ts`
  (currently `shareLinks` and `teams`, both PRO+). The spec must take a
  position on whether lifecycle rules are gated (recommendation in step 4).
- Roles: connections have ADMIN/VIEWER roles
  (`access.role !== "ADMIN"` pattern across `src/app/api/objects/*`); note
  that branch `feat/editor-team-role` adds an EDITOR role and may merge —
  the spec should state rule management is ADMIN-only and viewers read-only.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Verify SDK exports | `node -e "const s=require('@aws-sdk/client-s3'); console.log(typeof s.GetBucketLifecycleConfigurationCommand, typeof s.PutBucketLifecycleConfigurationCommand, typeof s.DeleteBucketLifecycleCommand)"` (run from repo root) | prints `function function function` |
| Heading check | `grep -n "^## " docs/superpowers/specs/<your-spec-file>.md` | Goal, Changes, Data Flow, Error States, Out of Scope all present |
| Clean tree check | `git status --short` | only the new spec file + `plans/README.md` |

## Scope

**In scope** (the only files you may create or modify):
- `docs/superpowers/specs/<YYYY-MM-DD>-lifecycle-rules-design.md` (create;
  use the current date, matching the existing naming convention)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):
- EVERYTHING under `src/` — including the ComingSoonTab. Removing or
  replacing the placeholder happens in the build phase, after the spec is
  approved.
- `docs/superpowers/plans/` — implementation plans come after spec approval.
- `package.json` / lockfile — no new dependencies for a document.

## Git workflow

- This repo's main checkout is shared by concurrent sessions — run
  `git branch --show-current` before committing.
- Branch: `docs/lifecycle-rules-spec`. One commit:
  `docs: add lifecycle rules design spec` (matches existing
  `docs: add CORS health probe and fix action design spec` in git log).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Read the cited code

Read in full: `bucket-detail-tabs.tsx`, `coming-soon-tab.tsx`,
`multipart-uploads-tab.tsx`, `src/lib/health/probes/bucket.ts`, the
`apply-cors` route, and the exemplar spec
`docs/superpowers/specs/2026-06-11-cors-health-probe-design.md`. Also skim
`docs/superpowers/specs/2026-06-06-permissions-tab-design.md` and
`2026-06-05-bucket-detail-page-design.md` if present — the lifecycle tab was
likely declared there; honor any constraints they state.

**Verify**: you can state, in one sentence each, (a) how a probe reports
`denied` vs `error`, and (b) how apply-cors merges config without clobbering
existing rules. (These two patterns must be reused in your spec.)

### Step 2: Confirm SDK + provider facts

1. Run the SDK exports command from "Commands you will need" → must print
   `function function function`.
2. Research provider compatibility (web docs if available in your
   environment): which lifecycle features work on AWS S3 vs MinIO vs
   Cloudflare R2 vs Backblaze B2 — at minimum: expiration rules,
   `AbortIncompleteMultipartUpload`, storage-class transitions, and filter
   support (prefix / tags / object size). If you cannot access the web,
   record each unresolved item explicitly in the spec's "Open questions"
   section instead of guessing — do not present unverified compatibility
   claims as fact.

**Verify**: SDK command prints `function function function`.

### Step 3: Decide the v1 slice (write this into the spec)

Constraints the recommendation must respect (from the codebase, not taste):

- **Read path first**: list existing lifecycle rules
  (`GetBucketLifecycleConfigurationCommand`) in the Lifecycle tab, replacing
  the ComingSoonTab. Handle the no-configuration S3 error the way the CORS
  probe handles `NoSuchCORSConfiguration` (treat as empty, not as failure).
- **One write action in v1**: a guided "Auto-abort incomplete uploads after N
  days" rule (`AbortIncompleteMultipartUpload`) — it pairs with the existing
  Incomplete-uploads tab, is the least destructive rule type, and is the one
  named use case in the shipped placeholder text. Follow apply-cors's
  read-merge-write shape so existing rules are never clobbered.
- **Explicitly defer to v2**: free-form rule builder, storage-class
  transitions (provider-dependent), tag/size filters, rule deletion UI (or
  justify including deletion — take a position).
- **Capability detection**: a `lifecycle` probe in
  `src/lib/health/probes/bucket.ts` following the versioning/CORS probe
  pattern, so unsupported providers show "not supported" instead of erroring.
- **RBAC**: viewing = any role with bucket access; creating/deleting rules =
  ADMIN only (mirror `canAbort` in `multipart-uploads-tab.tsx:39` and the
  apply-cors ADMIN check).
- **Destructive-action safety**: expiration rules delete user data; the spec
  must define a confirmation UX (type-the-bucket-name or equivalent) for any
  rule that deletes objects, and state that v1's abort-uploads rule does NOT
  need it (it only removes upload fragments).
- **Tier gating**: recommend gated-or-free with one sentence of reasoning
  (note for context: plan 001 enforces operation quotas; lifecycle rule
  reads/writes would be S3 config calls, currently unmetered).

### Step 4: Write the spec

Create `docs/superpowers/specs/<YYYY-MM-DD>-lifecycle-rules-design.md` in the
house format (exemplar: cors-health-probe spec). Required sections, in order:

1. Header — title, `**Date:**`, `**Scope:**` one-paragraph summary.
2. `## Goal` — the user problem; quote the shipped placeholder promise.
3. `## Changes` — numbered, per-file: new API routes (list + create-abort-rule,
   under `src/app/api/connections/[id]/buckets/[bucket]/lifecycle/...`
   mirroring apply-cors), probe addition, tab component replacing
   ComingSoonTab, query hooks/keys. Code sketches at the same fidelity as the
   exemplar (interfaces and key logic, not full implementations).
4. `## Data Flow` — fenced diagram like the exemplar.
5. `## Error States` — table: no lifecycle support on provider / no rules
   configured / AccessDenied on write / partial provider support.
6. `## Provider compatibility` — the matrix from Step 2, with unverified
   cells marked "unverified".
7. `## Open questions` — anything you could not resolve (each phrased as a
   decidable question with your recommended answer).
8. `## Out of Scope` — the v2 deferrals from Step 3.

**Verify**: `grep -n "^## " docs/superpowers/specs/<file>.md` → shows Goal,
Changes, Data Flow, Error States, Provider compatibility, Open questions,
Out of Scope.

### Step 5: Final check

**Verify**:
- `git status --short` → only the new spec file (+ `plans/README.md`)
- `git diff --stat -- src/` → empty (no source changes)

## Test plan

No code, no tests. The verification gates are the heading grep and the
clean-`src/` check above.

## Done criteria

ALL must hold:

- [ ] `docs/superpowers/specs/<YYYY-MM-DD>-lifecycle-rules-design.md` exists
- [ ] Heading grep shows all 7 required `##` sections
- [ ] The spec contains the literal strings `AbortIncompleteMultipartUpload`,
      `GetBucketLifecycleConfigurationCommand`, and a `## Provider compatibility` matrix
- [ ] Every compatibility claim is either sourced (link/doc name) or marked "unverified"
- [ ] `git diff --stat -- src/` is empty
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `bucket-detail-tabs.tsx` no longer contains the lifecycle ComingSoonTab
  (someone started building — your spec would conflict with in-flight work).
- A spec matching `docs/superpowers/specs/*lifecycle*` already exists.
- The SDK verification command does not print `function function function`
  (the assumed S3 commands are missing — the design's foundation is wrong).
- An existing design doc read in Step 1 explicitly rejected or deferred
  lifecycle rules with reasoning — surface that decision instead of
  re-proposing.

## Maintenance notes

- The spec is the deliverable; the follow-up is a human review, then an
  implementation plan in `docs/superpowers/plans/` (house convention pairs
  every spec with a plan file).
- If plan 001 (operation metering) has landed, the implementation phase
  should decide whether lifecycle config calls count as metered operations —
  flag it in Open questions either way.
- The `feat/editor-team-role` branch changes role checks on bucket routes;
  if merged before implementation, "ADMIN only" in the spec may need to
  become "ADMIN (not EDITOR)" — the spec should name the predicate file
  (`src/lib/roles.ts` on that branch) so implementers re-check.
