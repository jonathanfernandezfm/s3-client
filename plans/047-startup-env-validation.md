# Plan 047: Validate all required environment variables at server startup

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat c0e3376..HEAD -- src/lib/crypto.ts src/lib/db/prisma.ts src/lib/stripe.ts src/app/api/billing/checkout/route.ts`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx / ops
- **Planned at**: commit `c0e3376`, 2026-06-23

## Why this matters

Several required secrets are validated only on **first use**, not at boot. If a
production deploy is missing or mistypes `ENCRYPTION_KEY`, the server starts
green and the first user who lists a connection gets a 500 (`crypto.ts:9`
throws). `STRIPE_PRO_PRICE_ID` throws at module-parse time only when the
checkout route is first imported (`billing/checkout/route.ts:5`), so a broken
billing config is invisible until someone clicks Upgrade. `DATABASE_URL` is
passed straight to the Postgres pool with no check (`db/prisma.ts`). Before a
public release, a misconfigured deploy should **fail fast and loudly at
startup** with a clear message naming the missing variable — not surface as a
random 500 in front of a user. This plan adds one eager validation pass that
runs once when the server process starts.

## Current state

- `src/lib/crypto.ts:7-13` — `getKey()` throws `"ENCRYPTION_KEY must be a
  64-character hex string (32 bytes)"` only when called (every connection
  secret encrypt/decrypt). Excerpt:
  ```ts
  function getKey(): Buffer {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
      throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
    }
    return Buffer.from(hex, "hex");
  }
  ```
- `src/lib/db/prisma.ts` — reads `process.env.DATABASE_URL` and passes it to the
  pg `Pool` with no presence check.
- `src/lib/stripe.ts:3` — already does an eager top-level check for
  `STRIPE_SECRET_KEY` (`if (!process.env.STRIPE_SECRET_KEY) { throw ... }`).
  Match this style.
- `src/app/api/billing/checkout/route.ts:5` — `throw new Error("STRIPE_PRO_PRICE_ID is not set")`
  at module scope (only runs when that route module loads).
- `.env.example` (root) is the authoritative list of variables. The **required**
  ones for the app to function in production are:
  - `DATABASE_URL`
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`
  - `ENCRYPTION_KEY` (must be exactly 64 hex chars)
  - `SHARE_LINK_COOKIE_SECRET` (64 hex chars)
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`
  - **Conditionally required**: `INTERNAL_API_TOKEN` — required only when
    `SEARCH_INDEX_ENABLED === "true"`.
  - **Not required at boot** (have defaults or are public/optional):
    `SEARCH_INDEX_ENABLED`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_POSTHOG_KEY`,
    `NEXT_PUBLIC_POSTHOG_HOST`, and the optional `NEXT_PUBLIC_CLERK_*_URL`
    overrides. Do NOT fail on these.

**Convention to follow**: Next.js's official startup hook is
`instrumentation.ts` at the project root (or `src/instrumentation.ts`),
exporting an async `register()` function. It runs once per server process, for
the Node.js runtime, before requests are served. This repo currently has **no**
`instrumentation.ts` — confirm with `ls src/instrumentation.ts instrumentation.ts`.

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                     | exit 0, no errors   |
| Lint      | `pnpm lint`                          | exit 0              |
| Tests     | `pnpm test -- env`                   | new env tests pass  |
| Full test | `pnpm test`                          | all pass            |

## Scope

**In scope** (create unless noted):
- `src/lib/env.ts` (create) — the validation function.
- `src/lib/env.test.ts` (create) — unit tests.
- `src/instrumentation.ts` (create) — calls the validator at startup.

**Out of scope** (do NOT touch):
- `src/lib/crypto.ts`, `src/lib/stripe.ts`, `src/lib/db/prisma.ts` — leave their
  existing lazy checks in place; this plan adds an *additional* eager gate, it
  does not refactor the lazy ones.
- Any API route. Do not remove the existing per-route throws.
- `next.config.ts` — `instrumentation.ts` is auto-detected in Next 16; no config
  flag is needed.

## Git workflow

- Branch: `advisor/047-startup-env-validation`
- Conventional-commit style (matches `git log`, e.g. `feat:` / `chore:`):
  `feat: validate required env vars at server startup`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `src/lib/env.ts`

Export a pure function `validateEnv(env = process.env)` that collects **all**
missing/invalid required vars and throws a single error listing every problem
(so an operator fixes them in one pass, not one redeploy per var). Shape:

```ts
const REQUIRED = [
  "DATABASE_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "ENCRYPTION_KEY",
  "SHARE_LINK_COOKIE_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_PRICE_ID",
] as const;

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const problems: string[] = [];

  for (const key of REQUIRED) {
    if (!env[key] || env[key]!.trim() === "") {
      problems.push(`${key} is required but not set`);
    }
  }

  // Format checks for the two hex secrets (64 hex chars = 32 bytes).
  for (const key of ["ENCRYPTION_KEY", "SHARE_LINK_COOKIE_SECRET"] as const) {
    const val = env[key];
    if (val && !/^[0-9a-fA-F]{64}$/.test(val)) {
      problems.push(`${key} must be a 64-character hex string (32 bytes)`);
    }
  }

  // Conditional: search indexing needs the internal token.
  if (env.SEARCH_INDEX_ENABLED === "true" && !env.INTERNAL_API_TOKEN) {
    problems.push(
      "INTERNAL_API_TOKEN is required when SEARCH_INDEX_ENABLED=true"
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n  - ${problems.join("\n  - ")}`
    );
  }
}
```

Do not log any variable **values** — only names. (Never print a secret.)

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Create `src/instrumentation.ts`

```ts
import { validateEnv } from "@/lib/env";

export async function register() {
  // Only validate in the Node.js server runtime (not edge, not build-time
  // static analysis). NEXT_RUNTIME is "nodejs" for the server process.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateEnv();
  }
}
```

**Verify**: `ls src/instrumentation.ts` → file exists; `pnpm typecheck` → exit 0.

### Step 3: Unit-test `validateEnv`

Create `src/lib/env.test.ts`. Model the structure after any existing vitest
file (e.g. `src/lib/subscriptions/check-limits.test.ts` for `describe/it/expect`
imports from `vitest`). Cover:
- Passes with a complete, valid env object (build one inline with all REQUIRED
  vars set, hex secrets = 64 hex chars).
- Throws when `DATABASE_URL` is missing, and the message contains `DATABASE_URL`.
- Throws when `ENCRYPTION_KEY` is present but not 64 hex chars.
- Aggregates: with two vars missing, the message contains **both** names.
- `INTERNAL_API_TOKEN` is NOT required when `SEARCH_INDEX_ENABLED` is unset,
  but IS required when `SEARCH_INDEX_ENABLED === "true"`.
- Does not require `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_POSTHOG_KEY`.

Pass an explicit env object to `validateEnv(fakeEnv)` in each test — do **not**
mutate `process.env`.

**Verify**: `pnpm test -- env` → all new tests pass.

### Step 4: Full gate

**Verify**: `pnpm typecheck && pnpm lint && pnpm test` → all exit 0.

## Test plan

- New file `src/lib/env.test.ts` with the cases listed in Step 3 (happy path +
  each failure mode + the conditional + the aggregation behavior).
- Structural pattern: `src/lib/subscriptions/check-limits.test.ts`.
- Verification: `pnpm test -- env` → all pass.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0; `src/lib/env.test.ts` exists and its cases pass
- [ ] `src/instrumentation.ts` exists and calls `validateEnv()` guarded by
      `NEXT_RUNTIME === "nodejs"`
- [ ] `grep -rn "process.env" src/lib/env.ts` shows only variable **names**, no
      values are logged anywhere
- [ ] Only the three in-scope files are modified/created (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- An `instrumentation.ts` already exists at root or `src/` (drift — merge into
  it rather than overwriting).
- The build/startup begins throwing on a variable that is genuinely optional in
  this deployment (e.g. a CI environment that legitimately has no Stripe keys) —
  report so the REQUIRED list can be revisited rather than relaxing it blindly.
- `pnpm test` reveals existing tests that set `process.env` globally and now
  interact with the new code — report instead of editing unrelated tests.

## Maintenance notes

- When a new required secret is added anywhere in the app, add it to the
  `REQUIRED` array in `src/lib/env.ts` so the startup gate stays authoritative.
- This is a **belt-and-suspenders** gate: the per-module lazy throws in
  `crypto.ts`/`stripe.ts` remain as the last line of defense. Keep both.
- Reviewer should confirm no secret value is ever logged and that the
  `NEXT_RUNTIME` guard prevents the validator from running during edge/build
  passes where some server-only vars may legitimately be absent.
- Follow-up deferred: a typed `env` accessor object (so call sites read
  `env.DATABASE_URL` instead of `process.env.DATABASE_URL`) is a larger
  refactor and intentionally out of scope here.
