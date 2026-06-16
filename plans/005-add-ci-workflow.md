# Plan 005: Add a GitHub Actions CI workflow that runs the composite gate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 6dbaee9..HEAD -- .github package.json pnpm-lock.yaml`
> If `.github/` already exists with a workflow, STOP and read the existing
> file before writing anything new. If `package.json` lost the `typecheck`
> script, plan 003 has not landed — STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (adds a CI workflow file; nothing in `src/` changes)
- **Depends on**: [[003-clean-verification-baseline]] (clean gates exist), [[004-bump-critical-cve-dependencies]] (so audit step doesn't immediately fail CI on day 1)
- **Category**: dx
- **Planned at**: commit `6dbaee9`, 2026-06-13

## Why this matters

After plan 003, `pnpm test && pnpm typecheck && pnpm lint` exits 0 on
`main`. After plan 004, `pnpm audit --prod --audit-level=high` no longer
lists critical CVEs. Neither of those wins is *durable* without an
automated gate on PRs: the broken-baseline state at `6dbaee9` is exactly
what happens when a clean state has no enforcement. Adding a tiny GitHub
Actions workflow (one job, four commands) makes the composite gate the
default — and a regressing PR goes red instead of merging quietly.

There is currently no `.github/workflows/` directory at HEAD — verified by
`find .github -type d` during planning.

The workflow also closes the loop on plan 004's audit improvement: a
weekly `pnpm audit` run keeps new transitive CVEs visible without anyone
having to remember to check.

## Current state

- No `.github/` directory at the repo root.
- `package.json:5-12` (after plan 003 lands) has the scripts:
  `dev`, `build`, `start`, `db:migrate:deploy`, `lint`, `typecheck`,
  `test`, `test:watch`.
- `.nvmrc` exists at the repo root — node version is pinned. Read it:
  `cat .nvmrc` returns the target Node version (verify before writing the
  CI; the YAML must pin the same one).
- Package manager: pnpm, version pinned by `packageManager` field if
  present in `package.json` — verify with `grep packageManager package.json`.
  If absent, the workflow should pin a specific pnpm version (e.g. `9`).
- The build needs a `DATABASE_URL` to satisfy `prisma generate` (which
  runs as part of `pnpm build`). Prisma 7 with `provider = "postgresql"`
  in `prisma/schema.prisma:10` does NOT require a live DB for `generate`,
  but Next.js build paths that import `@/lib/db/prisma` at evaluation time
  expect the env var to be defined (even if unreachable). Plan accordingly:
  the CI sets `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres?schema=public`
  as a dummy. The CI does NOT need to start a PostgreSQL service — tests
  are unit-only (mocks prisma; verified by reading
  `src/lib/db/activity.test.ts`) and `next build` doesn't open DB
  connections at build time.
- Tests are unit-only and finish in ~3 seconds — no test-services needed.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Confirm Node target | `cat .nvmrc` | a version string like `22` or `20.x` |
| Confirm pnpm pin | `grep packageManager package.json` | shows `"packageManager": "pnpm@x.y.z"` OR returns nothing |
| Validate workflow YAML | `pnpm exec js-yaml .github/workflows/ci.yml > /dev/null` (or any YAML linter you trust) | exit 0 |
| Test locally | `pnpm test && pnpm typecheck && pnpm lint && pnpm build` | exit 0 |

## Scope

**In scope** (the only files you should create or modify):

- `.github/workflows/ci.yml` (create)
- `.github/workflows/security-audit.yml` (create; runs weekly + on demand)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):

- Any pre-commit hook setup (Husky, lint-staged) — out of scope; CI is
  enough enforcement to start, hooks are a follow-up.
- `package.json` — the scripts CI calls are already in place after plan
  003.
- Branch protection rules — those are GitHub UI / Settings concerns, not
  in-repo code. Note in PR description that the maintainer should enable
  "Require status checks to pass before merging" with the new `ci` check
  selected.
- Codecov / coverage upload — out of scope; the repo doesn't measure
  coverage today.

## Git workflow

- Branch: `chore/add-ci-workflow` off `main`.
- Suggested commits:
  - `ci: add composite-gate workflow (test + typecheck + lint + build)`
  - `ci: add weekly security-audit workflow`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Read the Node and pnpm pins

```bash
cat .nvmrc
grep packageManager package.json
```

Record both values. If `packageManager` is absent in package.json, decide
the pnpm version explicitly (default `pnpm@9` matches the lockfile format
this repo uses).

### Step 2: Write the main CI workflow

Create `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  gate:
    name: Composite gate
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      # Required to satisfy code paths that import prisma client during
      # type-check / next build. No real DB is needed: tests mock prisma
      # and `next build` does not open connections at build time.
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres?schema=public
      # Plausible defaults for env vars the codebase reads with `!`-asserts
      # at module-evaluation time. None are real secrets; all are placeholders
      # to let module imports succeed during build.
      CLERK_SECRET_KEY: sk_test_dummy
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk_test_dummy
      CLERK_WEBHOOK_SECRET: whsec_dummy
      ENCRYPTION_KEY: "0000000000000000000000000000000000000000000000000000000000000000"
      SHARE_LINK_COOKIE_SECRET: "0000000000000000000000000000000000000000000000000000000000000000"
      STRIPE_SECRET_KEY: sk_test_dummy
      STRIPE_WEBHOOK_SECRET: whsec_dummy
      STRIPE_PRO_PRICE_ID: price_dummy

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Read Node version
        id: node
        run: echo "version=$(cat .nvmrc)" >> "$GITHUB_OUTPUT"

      - name: Set up pnpm
        uses: pnpm/action-setup@v4
        with:
          # Replace with the version from package.json's packageManager field
          # if present, otherwise pin to the lockfile's compatible version.
          version: 9

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ steps.node.outputs.version }}
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Generate Prisma client
        run: pnpm prisma generate

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build
```

Notes the executor should re-verify before pasting verbatim:
- The `version: 9` in `pnpm/action-setup@v4` must match whatever
  Step 1 returned for `packageManager` in `package.json` (or 9 if unset).
- The seven placeholder env vars are NOT secrets — they exist solely to
  let modules that read `process.env.X!` during evaluation not crash at
  import time. Confirm at planning time which env vars the build path
  ACTUALLY reads at evaluation (search for `process.env.\w+!` and `process.env\.\w+ \?\?` in `src/`).
  If any are missing from the list above, add them. If any in the list
  are NEVER read during build (because they're only read inside route
  handlers at request time), they can be dropped.

The ENCRYPTION_KEY and SHARE_LINK_COOKIE_SECRET dummy values are 64-char
hex strings (32 zero bytes). They satisfy `src/lib/crypto.ts:9-12` and
`src/lib/share-links/cookie.ts:8-13` length checks. They must NEVER appear
in production env — they are safe to publish only because they are obvious
test placeholders.

### Step 3: Write the weekly security-audit workflow

Create `.github/workflows/security-audit.yml`:

```yaml
name: security-audit

on:
  schedule:
    # 09:00 UTC every Monday
    - cron: "0 9 * * 1"
  workflow_dispatch:

jobs:
  audit:
    name: pnpm audit (production)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - name: Read Node version
        id: node
        run: echo "version=$(cat .nvmrc)" >> "$GITHUB_OUTPUT"

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ steps.node.outputs.version }}
          cache: pnpm

      - name: Install (lockfile only)
        run: pnpm install --frozen-lockfile --ignore-scripts

      - name: Run audit
        # Fails when a HIGH or CRITICAL advisory is found in production deps.
        # The job's outcome surfaces in the Actions tab and can be subscribed
        # to via repository notifications.
        run: pnpm audit --prod --audit-level=high
```

`--ignore-scripts` skips `postinstall` etc. — safe because we only need
`pnpm-lock.yaml` resolution for `pnpm audit`. Faster than a full install.

### Step 4: Local validation before pushing

The Actions YAML cannot be fully tested locally, but the most common bugs
are catchable:

```bash
# Lint YAML syntax (any YAML tool works).
pnpm exec yaml-lint .github/workflows/ci.yml .github/workflows/security-audit.yml \
  || python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); yaml.safe_load(open('.github/workflows/security-audit.yml'))"
```

(If neither `yaml-lint` nor Python is present, skip this step and rely on
the GitHub-side parse error message on first push.)

Then re-run the actual composite gate locally:

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

Expected: exit 0. This proves the CI will pass on its first run.

### Step 5: Push and confirm the first run is green

After pushing the branch, navigate to the Actions tab on GitHub and
confirm `ci` runs and goes green for the PR. If it goes red, read the
job log — the most common causes:
- A missing env var the build needs (add it to the `env:` block).
- pnpm version mismatch (the `version: 9` doesn't match the lockfile
  format).
- `prisma generate` fails because `DATABASE_URL` is missing (check the
  env block).

**Verify**: `ci / Composite gate` shows ✅ on the PR.

### Step 6: Note maintenance asks in the PR description

In the PR description, list the manual maintainer follow-ups (not
in-repo work):

1. In GitHub Settings → Branches → branch protection for `main`, require
   `ci / Composite gate` to pass before merging.
2. Subscribe to `security-audit` job notifications (Actions → security-audit →
   "Notifications") so a new CRITICAL advisory pages the owner on the
   following Monday.
3. Confirm GitHub Actions minutes budget is acceptable for the cadence
   (each `ci` run is ~3–6 minutes; if PR throughput is heavy, consider
   skipping `pnpm build` on PRs that don't touch source — but this plan
   defaults to running the full gate, which is the conservative choice).

## Test plan

There are no in-repo tests for CI workflows. The gate is "does the first
CI run on this branch go green?"

## Done criteria

ALL must hold:

- [ ] `.github/workflows/ci.yml` exists; runs on push to `main` and on all PRs against `main`.
- [ ] `.github/workflows/security-audit.yml` exists; runs weekly and on `workflow_dispatch`.
- [ ] Both YAML files are valid (parse without error).
- [ ] Local `pnpm test && pnpm typecheck && pnpm lint && pnpm build` exits 0.
- [ ] First CI run on the PR goes green (the executor must wait for the run; if green isn't possible locally, this plan blocks until the run completes).
- [ ] No `src/` files touched (`git status --short` shows only `.github/**` and `plans/README.md`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- A `.github/workflows/` file already exists with a different shape — read
  it, evaluate whether to extend or replace, and report the choice. Do not
  silently overwrite.
- `pnpm build` fails in the GitHub Actions environment but passes locally —
  almost always a missing env var. Capture the failing log lines and
  report. The fix is usually a one-line env addition, but it belongs in
  the plan, not an ad-hoc CI tweak.
- The `prisma generate` step demands a real DB — Prisma 7 should not
  require one for codegen with a postgres provider, but if it does, stop
  and consult before adding a Postgres service container to the workflow
  (out of scope by this plan's design — keeps CI minutes low).
- `pnpm audit --prod` continues to report criticals AFTER plan 004 was
  meant to clear them. That's a plan-004 STOP, not a plan-005 STOP; defer
  by leaving the security-audit workflow disabled (`if: false` under the
  `audit` job) until plan 004 clears the queue. Note the deferral in the
  PR.

## Maintenance notes

- If pnpm's version moves significantly (e.g. v10), update both workflows'
  `pnpm/action-setup@v4` `version:` keys in lockstep with
  `package.json`'s `packageManager` field.
- If the codebase later adopts a `postinstall` hook that runs more than
  `prisma generate`, the `--ignore-scripts` in `security-audit.yml` may
  start hiding regressions. Re-evaluate at that time.
- If you add a `DATABASE_URL`-requiring code path to the build (server
  components reading data at build time), promote the dummy to a real
  Postgres service container or shift the affected code to client-side /
  request-time. The dummy works ONLY because today nothing connects.
- A natural next plan: per-job caching of `.next/cache/` and node_modules
  beyond what setup-node provides. Defer until CI minutes become a real
  concern.
- Reviewer focus: confirm the workflow doesn't run on every branch push
  (only on PRs + pushes to `main`). The `concurrency` block cancels stale
  runs so a force-push doesn't queue extras.
