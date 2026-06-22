# Plan 025: Stop logging plaintext S3 credentials in the connection-test route

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat e43a443..HEAD -- src/app/api/connections/test/route.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpt below against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S (one file, ~3 lines)
- **Risk**: LOW (removing a debug log + sanitizing an error log; no behaviour change visible to clients)
- **Depends on**: none
- **Category**: security / data-exposure
- **Source**: `/security-review` session, 2026-06-22 at commit `e43a443`
  (confirmed true positive, confidence 9/10)

## Why this matters

`src/app/api/connections/test/route.ts:71` calls `console.log(connectionConfig)`
on **every** connection test, before any S3 call. The logged object is
`{ endpoint, accessKeyId, secretAccessKey, region, forcePathStyle }` with **no
redaction**, so a live S3 **`secretAccessKey` is written to the server console
in plaintext**. This happens on both code paths:

- **Stored-connection path** (`body.id`): the secret is freshly **decrypted**
  via `getConnectionAccessById` → `decrypt(connection.secretAccessKey)`
  (`src/lib/db/connections.ts`), so logging it here defeats the AES-256-GCM
  at-rest encryption the rest of the app is careful to maintain.
- **Direct-credentials path**: `body.secretAccessKey` is logged raw from the
  request body.

The endpoint is `withAuth`-gated, so it is reachable by any authenticated user
(the direct-credentials path requires no ADMIN role). Anyone with read access
to application logs — a log-aggregation/SIEM service, the hosting provider's
console, a separate log-leak bug, or a compromised ops account — harvests S3
secret access keys for every connection that has ever been tested. An S3
`secretAccessKey` is a long-lived, high-value credential granting direct
read/write/delete on the customer's object storage, entirely outside this
application's authorization controls.

Line 81 (`console.log(error)`) additionally dumps the raw error object on every
failure. The error from a failed `ListBuckets` does not contain the secret, but
it is noisy, unstructured debug output that should be a sanitized log line for
consistency with the rest of the codebase (every other API route logs a
labelled message, e.g. `console.error("Stripe portal error:", err)`).

The `console.log(connectionConfig)` on line 71 is plainly **leftover debug
code** — note the stray indentation, the missing semicolon, and the surrounding
blank lines.

## Current state

`src/app/api/connections/test/route.ts:69-88` (the only lines this plan
touches; `connectionConfig` is built above on both branches):

```ts
    }

        console.log(connectionConfig)


    const client = createS3Client(connectionConfig);
    const command = new ListBucketsCommand({});

    await client.send(command);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log(error)
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
```

This is the **only** site in `src/app/api` that logs the credential object — a
grep of `console.*` across the API surface confirms every other call logs
errors, job IDs, or webhook events, none of which carry the S3 secret. So this
plan is correctly scoped to the single file.

## Scope

**In scope** (the only file you should modify):
- `src/app/api/connections/test/route.ts`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):
- Any other `console.*` call elsewhere in the repo — the grep confirmed none
  log the S3 secret; do not turn this into a logging-cleanup sweep.
- The auth/role logic, the `connectionConfig` construction, the S3 call, or the
  response shapes — behaviour must be unchanged.
- The separately-tracked (and rejected) SSRF concern about arbitrary endpoints
  — out of scope here; see the `/security-review` report.

## Steps

### Step 1: Remove the credential log (line 71)

Delete the `console.log(connectionConfig)` line entirely (and the stray blank
lines around it). After the edit, the `else { ... }` block is followed directly
by `const client = createS3Client(connectionConfig);`.

### Step 2: Sanitize the error log (line 81)

Replace `console.log(error)` with a labelled error log matching the house
style used by the billing/webhook routes:

```ts
  } catch (error) {
    console.error("[connections/test] connection test failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
```

Rationale: keep a diagnostic breadcrumb for failed tests (useful and
secret-free — the `ListBuckets` error does not contain the credential), but
make it a structured, labelled `console.error` consistent with the rest of the
codebase rather than a bare `console.log(error)`.

### Step 3: Verify no remaining credential logging

After editing, confirm the credential object is no longer logged anywhere in
the file or the API surface:

```bash
grep -n "console.log" src/app/api/connections/test/route.ts        # expect: no matches
grep -rn "console.*connectionConfig" src/                          # expect: no matches
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm exec tsc --noEmit` | no *new* errors vs. baseline |
| Lint | `pnpm lint` | no *new* problems vs. baseline (one fewer, ideally — the bare `console.log` may have been a lint warning) |
| Tests | `pnpm test` | no *new* failures vs. baseline |
| No secret logging | `grep -n "console.log" src/app/api/connections/test/route.ts` | no matches |

**Baseline note (pre-003)**: `main` is not on a clean typecheck/lint baseline
(plan 003 clears it). Capture `pnpm exec tsc --noEmit`, `pnpm lint`, and
`pnpm test` output before editing and measure your *delta* — done criterion is
**no new** errors/problems/failures introduced.

## Git workflow

- This repo's main checkout is shared by concurrent sessions — run
  `git branch --show-current` before committing.
- Branch: `fix/025-redact-connection-test-credential-logging`.
- Commit style: conventional commits. Suggested message:
  `fix(connections): stop logging plaintext S3 credentials in test route`.
- Do NOT push or open a PR unless the operator instructed it.

## Done criteria

ALL must hold:

- [ ] `console.log(connectionConfig)` is removed from `connections/test/route.ts`
- [ ] `console.log(error)` is replaced with a labelled `console.error` that does
      not log the credential object
- [ ] `grep -n "console.log" src/app/api/connections/test/route.ts` → no matches
- [ ] `pnpm exec tsc --noEmit` introduces no new errors vs. baseline
- [ ] `pnpm lint` introduces no new problems vs. baseline
- [ ] `pnpm test` shows no new failures vs. baseline
- [ ] No files outside the in-scope list are modified (`git status --short`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpt does not match the live file (drift since `e43a443`).
- Removing the log breaks a test that asserted on console output (unlikely; if
  so, fix the test to not depend on the leak).
- You discover the credential object is logged in another route too — report it
  rather than silently expanding scope.

## Maintenance notes

- **Root-cause prevention**: the leak was leftover debug `console.log`. A
  lightweight follow-up (not required by this plan) is an ESLint rule
  (`no-console` with an allow-list for `console.error`/`console.warn`, or a
  custom rule) so a bare `console.log` of an object can't silently ship again.
  Tracked here as a suggestion, not a planned task.
- **Defense-in-depth**: if structured logging is added later, route credential
  objects through a redaction helper that masks `secretAccessKey`/`accessKeyId`
  so no future call site can leak them regardless of intent.
