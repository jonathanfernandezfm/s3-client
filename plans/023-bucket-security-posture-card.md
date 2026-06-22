# Plan 023: Surface a read-only bucket security posture card (public access, policy, encryption)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d19fb78..HEAD -- src/components/buckets/overview-tab.tsx src/lib/queries/health.ts src/lib/queries/keys.ts src/lib/s3 src/app/api/connections`
> If any in-scope file (see Scope) changed since this plan was written,
> compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (new live S3 calls against arbitrary providers; the risk is graceful degradation on providers that don't implement these commands, not data safety — this plan is strictly read-only)
- **Depends on**: none
- **Category**: security / direction
- **Planned at**: commit `d19fb78`, 2026-06-22

## Why this matters

Misconfigured public buckets are the single most common cause of real-world
S3 data breaches, and this app gives users **no visibility into a bucket's
security posture today**. The existing health system probes only what *the
credentials can do* (can I PutObject? yes/no) — it never reports the bucket's
own configuration: whether the bucket is publicly readable, whether public
access is blocked, or whether encryption-at-rest is on. A grep across the repo
for `GetBucketPolicy`, `PublicAccessBlock`, and `GetBucketEncryption` returns
zero source hits. This plan adds a **read-only** "Security" card to the bucket
Overview that surfaces those three signals, so a user can answer "is this
bucket exposed?" without leaving the app. It deliberately does **not** add any
ability to *change* those settings — editing public-access is an abuse surface
that is being specified separately in plan 024 (design spike). Ship the
visibility first.

## Current state

The app has a mature read-only S3-config surface to copy patterns from:

- `src/app/api/buckets/[bucket]/versioning/route.ts` — the cleanest example of
  a **GET route that reads one piece of S3 bucket config and returns JSON**.
  It uses `withAuth`, resolves the connection with `getConnectionAccessById`,
  builds a client with `createS3Client(access.connection)`, sends one S3
  command, and maps the response through a pure helper. The GET requires only
  connection access (any role); only the PUT gates on `access.role === "ADMIN"`.
  Excerpt (lines 18–41):
  ```ts
  export const GET = withAuth<RouteContext>(async (req, { user, params }) => {
    try {
      const { bucket } = params;
      const connectionId = new URL(req.url).searchParams.get("connectionId");
      if (!connectionId || !bucket) {
        return NextResponse.json({ error: "connectionId and bucket are required" }, { status: 400 });
      }
      const access = await getConnectionAccessById(connectionId, user.id);
      if (!access) {
        return NextResponse.json({ error: "Connection not found" }, { status: 404 });
      }
      const client = createS3Client(access.connection);
      const response = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }));
      return NextResponse.json(toBucketVersioningStatus(response));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
  ```
  NOTE: this plan uses the **path-param connection style** instead, matching
  the health routes (see next bullet) — `/api/connections/[id]/buckets/[bucket]/...`.

- `src/app/api/connections/[id]/buckets/[bucket]/health-check/route.ts` — the
  bucket-scoped route shape this plan follows for its URL
  (`/api/connections/[id]/buckets/[bucket]/security-posture`). Its `GET`
  resolves access and returns 404 when access is missing:
  ```ts
  const access = await getConnectionAccessById(id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  ```

- `src/lib/health/probes/bucket.ts` (lines 262–292) — the **house pattern for
  mapping a "config not present" S3 error to a non-failure result**. The CORS
  probe special-cases the provider error before falling back:
  ```ts
  } catch (err) {
    const e = err as { name?: string; Code?: string };
    const name = e.name ?? e.Code ?? "";
    if (name === "NoSuchCORSConfiguration") {
      return { result: "denied", errorCode: "not_configured", durationMs: elapsed(start) };
    }
    const { result, errorCode } = classifyError(err);
    return { result, errorCode, durationMs: elapsed(start) };
  }
  ```
  Your classifier reuses this `e.name ?? e.Code ?? ""` shape. The "config
  absent" error names differ per command (listed in Step 2).

- `src/lib/buckets/versioning-helpers.ts` + `versioning-helpers.test.ts` — the
  house pattern for **extracting a pure, unit-tested mapping helper** out of a
  route. Your `classifyPostureError` helper follows this (pure function, its
  own `.test.ts`, no network).

- `src/lib/queries/health.ts` — the React Query hook pattern: a `fetchX`
  function that returns `null` on 404, and a `useX` hook with
  `staleTime: 60_000` and `enabled: !!connectionId && !!bucket`. Excerpt
  (lines 34–47, 103–113):
  ```ts
  async function fetchBucketHealth(connectionId: string, bucket: string): Promise<HealthReport | null> {
    const res = await fetch(`/api/connections/${connectionId}/buckets/${encodeURIComponent(bucket)}/health-check`);
    if (res.status === 404) return null;
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to fetch bucket health"); }
    return res.json();
  }
  export function useBucketHealth(connectionId: string, bucket: string): UseQueryResult<HealthReport | null> {
    return useQuery({
      queryKey: queryKeys.health.bucket(connectionId, bucket),
      queryFn: () => fetchBucketHealth(connectionId, bucket),
      enabled: !!connectionId && !!bucket,
      staleTime: 60_000,
    });
  }
  ```

- `src/lib/queries/keys.ts` (lines 77–95) — query-key factory. New groups are
  added as objects with `all` plus per-scope builders, e.g.:
  ```ts
  bucketVersioning: {
    all: ["bucket-versioning"] as const,
    status: (connectionId: string, bucket: string) =>
      [...queryKeys.bucketVersioning.all, connectionId, bucket] as const,
  },
  ```

- `src/components/buckets/overview-tab.tsx` — where the new card mounts. The
  current grid (lines 34–45):
  ```tsx
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <OverviewStorageStatsCard connectionId={connectionId} bucket={bucket} />
    <OverviewActivityCard connectionId={connectionId} bucket={bucket} />
    <OverviewIncompleteUploadsCard connectionId={connectionId} bucket={bucket} />
    <PermissionsCard connectionId={connectionId} bucket={bucket} />
  </div>
  ```

- `src/components/buckets/overview-incomplete-uploads-card.tsx` — the **card
  component exemplar** to model `OverviewSecurityCard` on: `"use client"`,
  `Card`/`CardHeader`/`CardTitle`/`CardContent` from `@/components/ui/card`, a
  lucide icon in the title, a query hook, and `isLoading` / `isError` /
  data branches. Copy its structure.

- `src/components/health/permissions-card.tsx` (lines 1–48) — uses the
  `ShieldCheck` lucide icon and a `text-sm` `CardTitle`; match this visual
  weight so the new card sits next to it consistently. (Use a different icon —
  `ShieldAlert` for the warning state, `Shield`/`Lock` otherwise — so the two
  cards are distinguishable.)

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Verify SDK exports | `node -e "const s=require('@aws-sdk/client-s3'); console.log(typeof s.GetPublicAccessBlockCommand, typeof s.GetBucketPolicyStatusCommand, typeof s.GetBucketEncryptionCommand)"` (run from repo root) | prints `function function function` |
| Typecheck | `pnpm exec tsc --noEmit` | exit 0 (see baseline note below) |
| Tests (this plan) | `pnpm test -- security-posture` | all pass, new tests included |
| Full test suite | `pnpm test` | no *new* failures vs. baseline |
| Lint | `pnpm lint` | no *new* problems vs. baseline |

**Baseline note (pre-003)**: At commit `d19fb78`, `main` is not on a clean
typecheck/lint baseline (plan 003 clears it). Before editing, capture the
baseline so you measure your *delta*, not the pre-existing debt:

```bash
pnpm exec tsc --noEmit 2>&1 | tee /tmp/tsc-before.txt; echo "tsc done"
pnpm lint            2>&1 | tee /tmp/lint-before.txt; echo "lint done"
pnpm test            2>&1 | tee /tmp/test-before.txt; echo "test done"
```

Your done criterion is: **no new** tsc errors, lint problems, or test
failures introduced by your changes (diff against the `-before` captures).

## Scope

**In scope** (the only files you should create or modify):
- `src/lib/s3/security-posture.ts` (create) — types + read logic + pure classifier
- `src/lib/s3/security-posture.test.ts` (create) — unit tests for the classifier
- `src/app/api/connections/[id]/buckets/[bucket]/security-posture/route.ts` (create)
- `src/lib/queries/keys.ts` (edit — add one `bucketSecurity` group)
- `src/lib/queries/bucket-security.ts` (create) — `useBucketSecurityPosture` hook
- `src/components/buckets/overview-security-card.tsx` (create)
- `src/components/buckets/overview-tab.tsx` (edit — mount the new card)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/health/probes/bucket.ts` and the whole `src/lib/health/` system —
  do NOT add these as capability probes. Security posture is *configuration
  data* (returns a policy/flags), not a yes/no capability; it needs its own
  read path and must not be persisted into the `bucketPermissionCheck` table.
- Any `Put*` / write command — this plan is read-only. No
  `PutPublicAccessBlock`, `PutBucketPolicy`, `PutObjectAcl`. Editing is plan 024.
- `prisma/schema.prisma` — no new tables; the posture is fetched live and
  cached only in React Query (like `versioning` and `bucketStats`).
- `src/components/buckets/permissions-tab.tsx` — leave the permissions tab
  alone; the new card lives only in the Overview grid.

## Git workflow

- This repo's main checkout is shared by concurrent sessions — run
  `git branch --show-current` before committing.
- Branch: `advisor/023-bucket-security-posture`.
- Commit style: conventional commits (recent log shows
  `feat(s3): standardize CopySource construction with a shared helper`).
  Suggested message: `feat(buckets): add read-only security posture card`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the SDK commands exist

Run the "Verify SDK exports" command. It MUST print `function function function`.
If any prints `undefined`, the installed `@aws-sdk/client-s3` version doesn't
export that command — STOP and report (the design's foundation is wrong).

**Verify**: command prints `function function function`.

### Step 2: Create the read module + pure classifier

Create `src/lib/s3/security-posture.ts`. It exposes the result type, a pure
error classifier, and an async reader that calls the three commands
independently (one failing must not sink the others).

Each S3 config command has a distinct "not configured" error name and may be
entirely **unsupported** by non-AWS providers (MinIO, R2, B2). The classifier
maps an error into one of: `"not-configured"` (the config simply isn't set),
`"unsupported"` (provider doesn't implement the API), or `"error"` (anything
else, including AccessDenied). Known signals:

- Public Access Block — absent: `NoSuchPublicAccessBlockConfiguration`.
- Bucket policy status — absent: `NoSuchBucketPolicy`.
- Encryption — absent: `ServerSideEncryptionConfigurationNotFoundError`.
- Unsupported across providers commonly surfaces as `NotImplemented`,
  `MethodNotAllowed`, `XAmzContentSHA256Mismatch`, or HTTP 501 — treat
  `NotImplemented` and `MethodNotAllowed` (and `$metadata.httpStatusCode === 501`)
  as `"unsupported"`.
- `AccessDenied` (or HTTP 403) → `"error"` with a flag so the UI can say
  "credentials can't read this" rather than "not configured".

Target shape:

```ts
// src/lib/s3/security-posture.ts
import {
  GetPublicAccessBlockCommand,
  GetBucketPolicyStatusCommand,
  GetBucketEncryptionCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

export type SignalState = "ok" | "not-configured" | "unsupported" | "denied" | "error";

export interface PublicAccessSignal {
  state: SignalState;
  // Only meaningful when state === "ok":
  blockPublicAcls?: boolean;
  ignorePublicAcls?: boolean;
  blockPublicPolicy?: boolean;
  restrictPublicBuckets?: boolean;
  fullyBlocked?: boolean; // all four true
}

export interface PolicySignal {
  state: SignalState;
  isPublic?: boolean; // only when state === "ok"
}

export interface EncryptionSignal {
  state: SignalState;
  algorithm?: string | null; // "AES256" | "aws:kms" | null, only when state === "ok"
}

export interface BucketSecurityPosture {
  publicAccessBlock: PublicAccessSignal;
  policy: PolicySignal;
  encryption: EncryptionSignal;
  // Conservative verdict: only the authoritative policy signal sets this true.
  warnPublic: boolean;
}

export function classifyPostureError(
  err: unknown,
  notConfiguredName: string,
): Exclude<SignalState, "ok"> {
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  const name = e.name ?? e.Code ?? "";
  const status = e.$metadata?.httpStatusCode;
  if (name === notConfiguredName) return "not-configured";
  if (name === "NotImplemented" || name === "MethodNotAllowed" || status === 501) return "unsupported";
  if (name === "AccessDenied" || status === 403) return "denied";
  return "error";
}

export async function readBucketSecurityPosture(
  client: S3Client,
  bucket: string,
): Promise<BucketSecurityPosture> {
  const [pab, policy, encryption] = await Promise.all([
    readPublicAccessBlock(client, bucket),
    readPolicy(client, bucket),
    readEncryption(client, bucket),
  ]);
  return {
    publicAccessBlock: pab,
    policy,
    encryption,
    warnPublic: policy.state === "ok" && policy.isPublic === true,
  };
}

async function readPublicAccessBlock(client: S3Client, bucket: string): Promise<PublicAccessSignal> {
  try {
    const r = await client.send(new GetPublicAccessBlockCommand({ Bucket: bucket }));
    const c = r.PublicAccessBlockConfiguration ?? {};
    const fullyBlocked = !!(c.BlockPublicAcls && c.IgnorePublicAcls && c.BlockPublicPolicy && c.RestrictPublicBuckets);
    return {
      state: "ok",
      blockPublicAcls: c.BlockPublicAcls, ignorePublicAcls: c.IgnorePublicAcls,
      blockPublicPolicy: c.BlockPublicPolicy, restrictPublicBuckets: c.RestrictPublicBuckets,
      fullyBlocked,
    };
  } catch (err) {
    return { state: classifyPostureError(err, "NoSuchPublicAccessBlockConfiguration") };
  }
}

async function readPolicy(client: S3Client, bucket: string): Promise<PolicySignal> {
  try {
    const r = await client.send(new GetBucketPolicyStatusCommand({ Bucket: bucket }));
    return { state: "ok", isPublic: r.PolicyStatus?.IsPublic ?? false };
  } catch (err) {
    return { state: classifyPostureError(err, "NoSuchBucketPolicy") };
  }
}

async function readEncryption(client: S3Client, bucket: string): Promise<EncryptionSignal> {
  try {
    const r = await client.send(new GetBucketEncryptionCommand({ Bucket: bucket }));
    const algo = r.ServerSideEncryptionConfiguration?.Rules?.[0]?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm ?? null;
    return { state: "ok", algorithm: algo };
  } catch (err) {
    return { state: classifyPostureError(err, "ServerSideEncryptionConfigurationNotFoundError") };
  }
}
```

**Verify**: `pnpm exec tsc --noEmit` introduces no new errors vs.
`/tmp/tsc-before.txt`.

### Step 3: Unit-test the classifier

Create `src/lib/s3/security-posture.test.ts`, modeled structurally on
`src/lib/buckets/versioning-helpers.test.ts` (same test runner/assert style as
the rest of the repo — open that file and match its imports and
`describe`/`it`/`expect` usage). Cover `classifyPostureError` for: the
matching not-configured name → `"not-configured"`; `NotImplemented` and
`MethodNotAllowed` → `"unsupported"`; `$metadata.httpStatusCode === 501` →
`"unsupported"`; `AccessDenied` and `httpStatusCode === 403` → `"denied"`; an
unknown error → `"error"`; and the `Code`-only shape (`{ Code: "NoSuchBucketPolicy" }`)
→ `"not-configured"` (S3 errors sometimes use `Code` not `name`).

**Verify**: `pnpm test -- security-posture` → all new tests pass.

### Step 4: Add the API route

Create `src/app/api/connections/[id]/buckets/[bucket]/security-posture/route.ts`,
following the `health-check` route's `GET` shape (path params, `withAuth`,
`getConnectionAccessById`, 404 when no access). Any authenticated role with
connection access may read posture (no ADMIN gate — it's read-only).

```ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getConnectionAccessById } from "@/lib/db/connections";
import { createS3Client } from "@/lib/s3/client";
import { readBucketSecurityPosture } from "@/lib/s3/security-posture";

type RouteContext = { params: Promise<{ id: string; bucket: string }> };

export const GET = withAuth<RouteContext>(async (_req, { user, params }) => {
  const { id, bucket } = params;
  const access = await getConnectionAccessById(id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const client = createS3Client(access.connection);
    const posture = await readBucketSecurityPosture(client, bucket);
    return NextResponse.json(posture);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
```

Confirm `withAuth`, `getConnectionAccessById`, and `createS3Client` import
paths match the apply-cors route (`@/lib/auth`, `@/lib/db/connections`,
`@/lib/s3/client`). Confirm `createS3Client(access.connection)` is the correct
call shape by reading `src/app/api/connections/[id]/buckets/[bucket]/apply-cors/route.ts:37`.

**Verify**: `pnpm exec tsc --noEmit` introduces no new errors.

### Step 5: Add the query key + hook

In `src/lib/queries/keys.ts`, add a new group next to `bucketStats`:

```ts
bucketSecurity: {
  all: ["bucket-security"] as const,
  byBucket: (connectionId: string, bucket: string) =>
    [...queryKeys.bucketSecurity.all, connectionId, bucket] as const,
},
```

Create `src/lib/queries/bucket-security.ts` modeled on `health.ts`'s
fetch+hook pattern:

```ts
"use client";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import type { BucketSecurityPosture } from "@/lib/s3/security-posture";

async function fetchBucketSecurity(connectionId: string, bucket: string): Promise<BucketSecurityPosture | null> {
  const res = await fetch(
    `/api/connections/${connectionId}/buckets/${encodeURIComponent(bucket)}/security-posture`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch security posture");
  }
  return res.json();
}

export function useBucketSecurityPosture(
  connectionId: string,
  bucket: string,
): UseQueryResult<BucketSecurityPosture | null> {
  return useQuery({
    queryKey: queryKeys.bucketSecurity.byBucket(connectionId, bucket),
    queryFn: () => fetchBucketSecurity(connectionId, bucket),
    enabled: !!connectionId && !!bucket,
    staleTime: 60_000,
  });
}
```

**Verify**: `pnpm exec tsc --noEmit` introduces no new errors.

### Step 6: Build the card

Create `src/components/buckets/overview-security-card.tsx`, modeled on
`overview-incomplete-uploads-card.tsx`. Requirements:

- `"use client"`; import `Card`/`CardContent`/`CardHeader`/`CardTitle` from
  `@/components/ui/card` and `useBucketSecurityPosture`.
- Title row with a lucide icon: `ShieldAlert` (red) when `posture.warnPublic`,
  otherwise `Lock`/`Shield` (muted). Title text "Security".
- `isLoading` → a "Checking…" line with `Loader2` spinner (copy the loading
  branch from the incomplete-uploads card).
- `isError` → "Couldn't read bucket security settings."
- On data, render three rows. For each signal, render a human label and a
  state value, never raw error objects:
  - **Public access**: if `publicAccessBlock.state === "ok"` →
    `fullyBlocked ? "Public access blocked" : "Public access NOT fully blocked"`;
    `"not-configured"` → "No public-access block set"; `"unsupported"` →
    "Not reported by this provider"; `"denied"` → "No permission to read";
    `"error"` → "Couldn't read".
  - **Bucket policy**: `"ok"` → `isPublic ? "Bucket is PUBLIC via policy" : "Not public via policy"`;
    other states mapped as above (`not-configured` → "No bucket policy").
  - **Encryption at rest**: `"ok"` → `algorithm ? \`Enabled (\${algorithm})\` : "Not enabled"`;
    other states mapped as above.
- When `posture.warnPublic`, show a prominent warning line
  (`text-red-600`/`text-destructive`) reading "This bucket is publicly
  accessible." above the rows.
- No links, no buttons, no fix actions — this card is informational only.

Then mount it in `src/components/buckets/overview-tab.tsx`: add the import and
place `<OverviewSecurityCard connectionId={connectionId} bucket={bucket} />`
inside the existing grid (after `<PermissionsCard ... />`).

**Verify**: `pnpm exec tsc --noEmit` introduces no new errors;
`pnpm lint` introduces no new problems.

### Step 7: Full verification

Run the full gates and diff against the baselines from "Commands you will need".

**Verify**:
- `pnpm test` → no new failures vs. `/tmp/test-before.txt`.
- `pnpm exec tsc --noEmit` → no new errors vs. `/tmp/tsc-before.txt`.
- `pnpm lint` → no new problems vs. `/tmp/lint-before.txt`.
- `git status --short` → only the in-scope files.

## Test plan

- New: `src/lib/s3/security-posture.test.ts` — unit tests for
  `classifyPostureError` (all branches listed in Step 3). This is the only
  new test file; the route and card are thin wrappers verified by typecheck.
- Pattern to follow: `src/lib/buckets/versioning-helpers.test.ts` (same
  runner, import style, and assertion API).
- Verification: `pnpm test -- security-posture` → all new tests pass; full
  `pnpm test` shows no new failures.

## Done criteria

ALL must hold:

- [ ] SDK export check prints `function function function`
- [ ] `pnpm test -- security-posture` passes; the classifier test covers
      not-configured / unsupported / denied / error / `Code`-only branches
- [ ] `pnpm exec tsc --noEmit` introduces no new errors vs. baseline
- [ ] `pnpm lint` introduces no new problems vs. baseline
- [ ] `grep -rn "Put\(PublicAccessBlock\|BucketPolicy\|ObjectAcl\)" src/` returns no matches (this plan added no write commands)
- [ ] `git grep -l "readBucketSecurityPosture" src/app/api` shows the new route uses the helper
- [ ] The new card is mounted in `overview-tab.tsx` (`grep -n OverviewSecurityCard src/components/buckets/overview-tab.tsx` → 2 hits: import + JSX)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The SDK export check prints any `undefined` (assumed commands missing).
- The "Current state" excerpts don't match the live files (drift since `d19fb78`).
- Any verification fails twice after a reasonable fix attempt.
- You find yourself needing to add a `Put*` command, a Prisma table, or a
  change under `src/lib/health/` to make this work — all are out of scope; the
  posture must be a live read cached only in React Query.
- You discover an existing `security-posture` route or `OverviewSecurityCard`
  already exists (someone built this in parallel).

## Maintenance notes

- **Provider variance is the live risk.** AWS S3 implements all three commands;
  MinIO, Cloudflare R2, and Backblaze B2 implement them inconsistently. The
  `classifyPostureError` "unsupported" branch is what keeps the card honest on
  those providers — a reviewer should confirm the card renders "Not reported by
  this provider" (not an error toast) when a command 501s. If you have a MinIO
  endpoint, smoke-test against it before merging.
- **The `warnPublic` verdict is deliberately conservative** — it trusts only
  `GetBucketPolicyStatus.IsPublic` (S3's authoritative public-or-not signal),
  not the absence of a public-access block. A reviewer should scrutinize that
  this never *under*-reports a known-public bucket; widening the verdict to
  also flag ACL-based public access is a follow-up, not this plan.
- **This card is the read half of a future read/write feature.** Plan 024 (the
  bucket-permission-editing design spike) specifies the *write* side; when that
  ships, this card's signals become the "current state" an editor mutates, and
  the route here is the natural place to add the corresponding `PUT`. Keep the
  response shape stable so the editor can reuse it.
- If a per-row "credentials can't read this" state (`"denied"`) shows up a lot
  in the wild, consider adding `s3:GetBucketPolicyStatus` /
  `s3:GetEncryptionConfiguration` / `s3:GetBucketPublicAccessBlock` to the
  documented IAM policy in the README — but that's docs, not code.
