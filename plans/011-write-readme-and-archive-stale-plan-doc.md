# Plan 011: Add a top-level README and archive the stale APPLICATION_PLAN.md

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 6dbaee9..HEAD -- README.md APPLICATION_PLAN.md docs CLAUDE.md`
> If `README.md` already exists or `APPLICATION_PLAN.md` has been updated
> since this plan was written, STOP and read both before proceeding.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (docs only)
- **Depends on**: none (does NOT depend on plan 003 — purely additive)
- **Category**: docs
- **Planned at**: commit `6dbaee9`, 2026-06-13

## Why this matters

The repo has no top-level `README.md`. A new human or agent contributor
clones the repo and has to read `CLAUDE.md` to figure out what the project
does — and `CLAUDE.md` is explicitly written for one agent.

Worse, the repo HAS `APPLICATION_PLAN.md`, which looks authoritative but
is actively wrong. Verified at planning:

- Line 13 says "Next.js 15 (App Router)" — actual is Next.js ^16.1.1.
- The entire feature checklist (lines 60–193) shows every Phase 1 / 2
  bullet unchecked, but the dashboard, file browser, uploads, downloads,
  bucket management, file preview, drag-and-drop, multi-select, and
  bulk operations have all shipped (see git history and current `src/`
  tree).
- "Phase 3 (Future)" (lines 320–327) lists "Authentication & user
  management" and "Access control / permissions" as future, when both
  are shipped (Clerk + the EDITOR/VIEWER/ADMIN role system).

A wrong doc costs more than a missing one — readers trust it. This plan
adds an honest, short README and archives the stale plan with a banner
note so the historical context isn't lost but readers know not to trust
the checklists.

## Current state

At repo root (verified at `6dbaee9`):

- No `README.md`.
- `APPLICATION_PLAN.md` (327 lines), dated by Feb 2026 file mtime; outdated as described.
- `CLAUDE.md` — agent-oriented, covers stack and architecture at a high
  level; useful but not a contributor README.
- `docs/`:
  - `DIRECT_UPLOADS_CORS.md`, `DRAG_DROP_IMPLEMENTATION_PLAN.md` — feature-spec docs.
  - `docs/superpowers/specs/` — a large set of design specs (one per
    feature). These are the source of truth for "what was decided."
  - `docs/superpowers/plans/` — implementation plans.
  - `docs/superpowers/runbooks/` — one runbook (search-index rollout).
- `plans/`:
  - This index. `001`, `002` plus the plans `003`–`010` landed via the
    deep audit.

The Tech-stack and architecture summary in `CLAUDE.md` is current and
accurate (verified). The README can defer to it rather than re-stating.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests | `pnpm test` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 (post-plan-003) |
| Markdown lint (optional) | `pnpm exec markdownlint README.md` (if available) | exit 0; if markdownlint isn't installed, skip |
| Dead-link check (optional) | open the README in a markdown preview and click each link | each resolves |

## Scope

**In scope** (the only files you should create or modify):

- `README.md` (create at repo root).
- `APPLICATION_PLAN.md` — prepend an archive banner OR move to `docs/archive/`.
- `docs/archive/APPLICATION_PLAN.md` (create if going the move route).
- `plans/README.md` — status row.

**Out of scope** (do NOT touch):

- `CLAUDE.md` — the deep-audit-recommended README defers to it; do not
  rewrite.
- `docs/superpowers/**` — leave entirely; that's the team's authoritative
  spec/runbook archive.
- `docs/DIRECT_UPLOADS_CORS.md`, `docs/DRAG_DROP_IMPLEMENTATION_PLAN.md`
  — neither is stale enough to need archiving; leave as-is.
- A `CONTRIBUTING.md` — useful but a separate plan; the README only links
  to where development commands live.
- `.github/PULL_REQUEST_TEMPLATE.md` etc. — separate plan.
- The marketing/landing page copy — that's a product surface, not a repo
  doc.

## Git workflow

- Branch: `docs/readme-and-archive-stale-plan` off `main`.
- Suggested commits:
  - `docs: add top-level README`
  - `docs: archive APPLICATION_PLAN.md with banner`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Decide between banner and move (and stick with banner)

Two equally valid archive strategies:

A. Prepend a banner to `APPLICATION_PLAN.md` (top of file, before line 1):
   ```markdown
   > **Status: Historical.** This document was the initial product/design
   > brief (Feb 2026) and is no longer maintained. The framework version,
   > feature checkboxes, and Phase 3 list are out of date. See `README.md`
   > and `docs/superpowers/specs/` for current state.

   ---
   ```

B. Move the file to `docs/archive/APPLICATION_PLAN.md` and write a stub
   in its place.

Pick A (the banner). Reasoning: git history is easier to scan with the
file at its original path; the move adds a step for no real benefit.

### Step 2: Write the README

Create `README.md` at repo root. Keep it ~120–180 lines. Sections in
order:

```markdown
# s3-dock

A multi-tenant web application for managing S3-compatible object storage —
AWS S3, MinIO, DigitalOcean Spaces, and others. Stores connection
credentials encrypted at rest, browses buckets, uploads / downloads
files (including multipart and zip), runs configurable bucket health
checks, and supports per-team workspaces with ADMIN / EDITOR / VIEWER roles.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- PostgreSQL via Prisma 7 (`@prisma/adapter-pg`)
- Clerk for authentication
- AWS SDK v3 for all S3 operations
- TanStack React Query 5 for server state + Zustand for client state
- Tailwind CSS 4 + Radix UI primitives
- Vitest for unit tests

(See `CLAUDE.md` for the architectural details, including the multi-
connection access model, query-key factory, and S3 client lifecycle.)

## Quick start

Prerequisites: Node (`.nvmrc` pins the version), pnpm, PostgreSQL 14+.

```bash
git clone <repo>
cd s3-dock
pnpm install                       # postinstall runs prisma generate
cp .env.example .env                # fill in real values; see Env vars below
pnpm prisma migrate dev             # creates the dev DB schema
pnpm dev                            # http://localhost:3000
```

Sign in at `/sign-in` with the Clerk test account you created in the
dashboard. After sign-in, add a connection via `/app/connections`.

## Env vars

See `.env.example` for the full list. Required to run:

- `DATABASE_URL` — Postgres connection string.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
  `CLERK_WEBHOOK_SECRET` — Clerk auth.
- `ENCRYPTION_KEY` — 32-byte hex; encrypts stored S3 secret access keys.
  Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `SHARE_LINK_COOKIE_SECRET` — 32-byte hex; signs the share-link unlock JWT.

Optional (feature-gated):

- `STRIPE_*` — billing.
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` — analytics.
- `SEARCH_INDEX_ENABLED` + `INTERNAL_API_TOKEN` — search crawler.

## Scripts

| Command           | Purpose                                                |
|-------------------|--------------------------------------------------------|
| `pnpm dev`        | Next dev server (Turbopack, host `0.0.0.0`)            |
| `pnpm build`      | Production build (runs `prisma generate` first)        |
| `pnpm start`      | Production server (runs `prisma migrate deploy` first) |
| `pnpm test`       | Vitest, one-shot                                       |
| `pnpm test:watch` | Vitest, watch mode                                     |
| `pnpm lint`       | ESLint                                                 |
| `pnpm typecheck`  | `tsc --noEmit`                                         |

The composite gate (`pnpm test && pnpm typecheck && pnpm lint`) must
exit 0. CI in `.github/workflows/ci.yml` enforces it on every PR.

## Project layout

- `src/app/` — Next App Router routes (auth, dashboard, public share links, `/api/**`).
- `src/components/` — feature-organized React components.
- `src/lib/` — domain logic: `auth/`, `s3/`, `queries/`, `stores/`,
  `db/`, `health/`, `search/`, `share-links/`, `subscriptions/`,
  `uploads/`, `versions/`, `zip/`.
- `src/generated/prisma/` — generated Prisma client (don't hand-edit).
- `prisma/` — schema + migrations.
- `docs/superpowers/{specs,plans,runbooks}/` — design specs, feature
  plans, ops runbooks (authoritative for "what was decided").
- `plans/` — audit-driven implementation plans (this one was generated
  by `/improve deep`).

## Working in this repo

- The repo uses shared concurrent agent sessions in the main checkout —
  if you see in-progress branches, verify the branch you're on before
  committing (`git branch --show-current`).
- Commit messages follow Conventional Commits (`feat`, `fix`, `chore`,
  `docs`, `perf`, `refactor`).
- A composite "test + typecheck + lint" gate must stay green on `main`.

## Further reading

- `CLAUDE.md` — agent + architecture guide.
- `docs/superpowers/specs/` — per-feature design specs.
- `plans/README.md` — open implementation plans from the latest audit.
```

(Adjust the wording wherever the codebase has more current details. The
goal is honest current state in under 200 lines.)

**Verify**:
- `wc -l README.md` returns ~120–180.
- Every relative link in the README resolves (e.g. `CLAUDE.md`,
  `docs/superpowers/specs/`, `plans/README.md`).
- `pnpm exec markdownlint README.md` exits 0 (if `markdownlint` is
  installed; otherwise skip).

### Step 3: Prepend the archive banner to APPLICATION_PLAN.md

Read the current top of `APPLICATION_PLAN.md` and add the banner before
the existing `# S3 Web UI - Application Definition Document` heading:

```markdown
> **Status: Historical.** This document was the initial product/design
> brief (Feb 2026) and is no longer maintained. The framework version
> (Next.js 15), feature checkboxes, and Phase 3 list are out of date.
> Current state lives in `README.md` and `docs/superpowers/specs/`.

---

# S3 Web UI - Application Definition Document

...
```

Do NOT edit the body of the document. The banner is enough.

**Verify**:
- `head -5 APPLICATION_PLAN.md` shows the banner.
- `git diff APPLICATION_PLAN.md` shows only the banner addition; the
  rest of the file unchanged.

### Step 4: Composite gate

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Expected: exit 0. (This plan adds no code; the gate is just a sanity
check that nothing accidentally regressed.)

## Test plan

No tests.

Manual visual check: render `README.md` in a markdown previewer (or
push to a PR and view on GitHub) and confirm every link resolves and the
tone is brief.

## Done criteria

ALL must hold:

- [ ] `README.md` exists at repo root, ~120–180 lines, all links resolve.
- [ ] `APPLICATION_PLAN.md` first line(s) carry the "Status: Historical" banner; rest of the file unchanged.
- [ ] No `src/**` files modified (`git status --short`).
- [ ] `pnpm test && pnpm typecheck && pnpm lint` exit 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- `README.md` already exists with content. Read it, decide whether to
  rewrite or extend, and report.
- A linked file the README points at (`CLAUDE.md`, `docs/superpowers/specs/`,
  `plans/README.md`) doesn't exist or has been renamed.
- An env-var name in `.env.example` differs from what the README lists
  — the README must reflect the example.

## Maintenance notes

- The README intentionally defers detail to `CLAUDE.md` and the
  `docs/superpowers/specs/` archive. If a contributor needs depth on a
  feature, that's where they go.
- A future `CONTRIBUTING.md` should cover branch naming, PR template,
  review etiquette, and the "concurrent agent sessions in the main
  checkout" caveat. Not in scope here.
- The archive banner approach keeps `APPLICATION_PLAN.md` at its
  historical path; if a future cleanup moves all `*.md` design docs to
  `docs/archive/`, do that as a single sweep rather than per-file.
- Reviewer focus: scan the README's "Scripts" table against `package.json`
  scripts at the time of review — they must match (the `typecheck`
  script depends on plan 003 having landed).
