# Plan 007: Add a `requireConnectionAccess` helper, zod schemas, and a route-test harness; migrate 4 representative routes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 6dbaee9..HEAD -- src/lib/auth src/lib/db/connections.ts src/lib/roles.ts src/app/api/objects/delete src/app/api/objects/copy src/app/api/objects/move src/app/api/objects/rename package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (helper changes hot route paths; the test harness is new infrastructure)
- **Depends on**: [[003-clean-verification-baseline]]
- **Category**: tech-debt + sec + tests
- **Planned at**: commit `6dbaee9`, 2026-06-13

## Why this matters

Three tightly-coupled gaps:

1. **Duplicated access-check boilerplate.** Every mutating object route
   repeats the same ~10 lines (`getConnectionAccessById` → null guard →
   `canManageFiles(role)` → 403). Counted at planning time: ≥6 object
   routes (`delete`, `copy`, `move`, `rename`, `folder`, `tag`,
   `metadata`, `download`, `download-zip`, `presign-batch`, `head`,
   `multipart/{create,sign-parts,complete}`, `versions/{copy,presign,purge,restore,undelete}`).
   Drift is already present — `copy/route.ts:76` checks only the
   target's role (correctly) but the symmetric write-on-target shape is
   handwritten in each route. A new route can forget the check, or
   apply the wrong role helper (`canManageConnections` vs
   `canManageFiles`), and nothing fails at type-check.

2. **Hand-rolled JSON-body validation.** Same routes have ad-hoc
   `if (!connectionId || !bucket || …) return 400;` guards with
   inconsistent error shapes and missing field-shape checks (e.g.
   `keys` accepted as `any[]` despite being typed as `string[]`).
   `connections/import/route.ts:23-50` shows the house pattern for
   real validation — but only there. Most routes trust the body.

3. **No route tests.** Only `src/app/api/webhooks/stripe/handler.test.ts`
   (helper-only) and `src/app/api/activity/query-helpers.test.ts`
   (helper-only) exist out of ~60 route files. The wins from #1 and #2
   are not provable without a test harness.

This plan establishes the patterns and migrates the **four
representative mutation routes** — `delete`, `copy`, `move`, `rename` —
as the demonstration. The remaining ~20 routes follow the same
playbook in subsequent plans (each one becomes a small, low-risk PR
once this lands).

The scope is deliberately bounded. This is NOT a "validate everything,
refactor all routes" plan. It's "introduce the three building blocks
and prove them on 4 routes." If the pattern is wrong, we want to
discover it before mechanically applying it to 20 more routes.

## Current state

### Existing access pattern (verified at `6dbaee9`)

`src/lib/db/connections.ts:136-180` exports
`getConnectionAccessById(id, userId)` returning either `null` or
`{ connection, workspaceId, workspaceType, role }`. `role` is
`"ADMIN" | "EDITOR" | "VIEWER" | null` (from `src/lib/roles.ts`).

`src/lib/roles.ts`:

- `canManageFiles(role)` → `role === "ADMIN" || role === "EDITOR"` —
  file-level write.
- `canManageConnections(role)` → `role === "ADMIN"` — infrastructure
  write.

`src/lib/auth/protect.ts:19-95` exports
`withAuth<T>(handler)` returning a NextRequest handler that:
- Reads Clerk `auth()` to get the user.
- Loads the matching `User` row from PostgreSQL (or upserts on first
  sign-in via `currentUser()`).
- Calls `handler(req, { user, params })`.
- Catches and returns 401/500.

The "load user → check connection access → check role" pattern is run
in every authenticated route via:

```ts
const access = await getConnectionAccessById(connectionId, user.id);
if (!access) {
  return NextResponse.json({ error: "Connection not found" }, { status: 404 });
}
if (!canManageFiles(access.role)) {
  return NextResponse.json(
    { error: "You do not have permission to modify objects for this connection" },
    { status: 403 }
  );
}
```

### Routes in scope for this plan (read verbatim before editing)

1. **`src/app/api/objects/delete/route.ts`** — single connection;
   body is `{ connectionId, bucket, keys: string[] }`; requires write.
2. **`src/app/api/objects/copy/route.ts`** — dual connection;
   body is `{ sourceConnectionId, sourceBucket, sourceKeys, targetConnectionId, targetBucket, targetPath }`;
   **only target** requires write (line 75 comment says so explicitly).
3. **`src/app/api/objects/move/route.ts`** — dual connection;
   body is the same as copy with the same names; **both** require write
   (because we delete from source). Verify by reading the live file —
   the comment at the top of the role check section is authoritative.
4. **`src/app/api/objects/rename/route.ts`** — single connection;
   body is `{ connectionId, bucket, sourceKey, targetKey }`;
   requires write. Has an extra "single-file only" guard at line 34.

### What is NOT in scope this plan

- Other mutating routes (`folder`, `tag`, `metadata`, `versions/*`,
  `multipart/*`) — follow-up plans.
- All read routes (`route.ts`/list, `head`, `download`,
  `presign-batch`, `download-zip`, `tags`, `metadata` GET) — same
  helper applies but defer.
- Connection routes (`/api/connections/**`), team routes (`/api/teams/**`),
  share-links — those have different patterns. Defer.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Add zod | `pnpm add zod` | adds `zod` to `dependencies` in `package.json` |
| Tests | `pnpm test` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Test the harness | `pnpm test src/lib/test-utils` | passes |
| Test the 4 migrated routes | `pnpm test src/app/api/objects/{delete,copy,move,rename}/route.test.ts` | 12+ new tests pass |

Plan 003 establishes the green composite-gate pre-state.

## Scope

**In scope** (the only files you should create or modify):

Helpers and infrastructure:
- `src/lib/auth/require-connection-access.ts` (create)
- `src/lib/auth/require-connection-access.test.ts` (create)
- `src/lib/auth/index.ts` — if a barrel file exists at this path, add
  exports; if not, leave as-is and import directly from the new file.
- `src/lib/schemas/objects.ts` (create)
- `src/lib/schemas/objects.test.ts` (create)
- `src/lib/test-utils/api-route.ts` (create)
- `src/lib/test-utils/api-route.test.ts` (create)
- `package.json` — add `zod` to `dependencies`.

Route migrations:
- `src/app/api/objects/delete/route.ts`
- `src/app/api/objects/delete/route.test.ts` (create)
- `src/app/api/objects/copy/route.ts`
- `src/app/api/objects/copy/route.test.ts` (create)
- `src/app/api/objects/move/route.ts`
- `src/app/api/objects/move/route.test.ts` (create)
- `src/app/api/objects/rename/route.ts`
- `src/app/api/objects/rename/route.test.ts` (create)

Index:
- `plans/README.md` — status row.

**Out of scope** (do NOT touch):

- `withAuth` itself in `src/lib/auth/protect.ts` — leave intact.
- `getConnectionAccessById`, `canManageFiles`, `canManageConnections` —
  unchanged.
- Schema validation on any route other than the four listed.
- Any other route handler.
- Switching to a global error format — the existing
  `{ error: "..." }` shape stays.
- Server-action APIs.
- Stripe / Clerk webhooks.

## Git workflow

- Branch: `chore/route-access-helper-and-schemas` off `main`.
- Suggested commits (or one large commit per file group):
  - `chore(deps): add zod for runtime schema validation`
  - `feat(auth): add requireConnectionAccess helper`
  - `feat(schemas): add zod schemas for object mutations`
  - `feat(test-utils): add api-route test harness`
  - `refactor(api/objects/delete): use requireConnectionAccess and schema validation; add tests`
  - …repeat for copy, move, rename.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add zod

```bash
pnpm add zod
```

Confirm `package.json` now has `"zod": "^3.x.x"` (or whatever the
latest 3.x resolves to) in `dependencies` — NOT in `devDependencies`.
It's a runtime dep.

**Verify**: `grep -c '"zod"' package.json` → `1`. `pnpm typecheck` →
exit 0.

### Step 2: Write `requireConnectionAccess`

Create `src/lib/auth/require-connection-access.ts`:

```ts
import { NextResponse } from "next/server";
import { getConnectionAccessById, type ConnectionAccess } from "@/lib/db/connections";
import { canManageConnections, canManageFiles } from "@/lib/roles";

/**
 * Access requirement for an object/bucket route. "read" allows VIEWER,
 * "write" requires EDITOR or ADMIN (matches canManageFiles),
 * "admin" requires ADMIN (matches canManageConnections).
 */
export type AccessRequirement = "read" | "write" | "admin";

/**
 * Resolve the calling user's access to a connection, enforcing the
 * required role gate. Returns either the loaded access object or the
 * NextResponse the route should immediately return.
 *
 * Routes consume it like:
 *
 *   const result = await requireConnectionAccess(connectionId, user.id, "write");
 *   if (result instanceof NextResponse) return result;
 *   const { access } = result;
 */
export async function requireConnectionAccess(
  connectionId: string,
  userId: string,
  required: AccessRequirement
): Promise<{ access: ConnectionAccess } | NextResponse> {
  const access = await getConnectionAccessById(connectionId, userId);
  if (!access) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  if (required === "admin" && !canManageConnections(access.role)) {
    return NextResponse.json(
      {
        error:
          "You do not have permission to manage configuration for this connection",
      },
      { status: 403 }
    );
  }

  if (required === "write" && !canManageFiles(access.role)) {
    return NextResponse.json(
      {
        error:
          "You do not have permission to modify objects for this connection",
      },
      { status: 403 }
    );
  }

  return { access };
}
```

Match the existing error-message phrasing from the routes so no
end-user-visible string changes.

Tests (`src/lib/auth/require-connection-access.test.ts`): mock
`@/lib/db/connections.getConnectionAccessById` and assert each branch:

1. `null` access → 404 response with `error: "Connection not found"`.
2. Required `"write"`, role `"VIEWER"` → 403 with "modify objects" phrasing.
3. Required `"write"`, role `"EDITOR"` → returns `{ access }`.
4. Required `"write"`, role `"ADMIN"` → returns `{ access }`.
5. Required `"admin"`, role `"EDITOR"` → 403 with "manage configuration" phrasing.
6. Required `"admin"`, role `"ADMIN"` → returns `{ access }`.
7. Required `"read"`, role `"VIEWER"` → returns `{ access }`.

Mocking style follows `src/lib/db/activity.test.ts`:

```ts
import { describe, test, expect, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/db/connections", () => ({
  getConnectionAccessById: vi.fn(),
}));

import { getConnectionAccessById } from "@/lib/db/connections";
import { requireConnectionAccess } from "./require-connection-access";
```

**Verify**: `pnpm test src/lib/auth/require-connection-access.test.ts`
→ 7 tests pass.

### Step 3: Write the zod schemas

Create `src/lib/schemas/objects.ts`. Field constraints come from
reading the routes' current implicit assumptions:

```ts
import { z } from "zod";

// Reusable building blocks
const ConnectionId = z.string().uuid();
const BucketName = z.string().min(1).max(63);
const ObjectKey = z.string().min(1);
// Folder targets need to allow empty string (root) — narrow to a non-key
// shape if the route accepts a folder vs an object distinctly.
const FolderPath = z.string();

export const DeleteObjectsRequest = z.object({
  connectionId: ConnectionId,
  bucket: BucketName,
  keys: z.array(ObjectKey).min(1).max(1000),
});
export type DeleteObjectsRequest = z.infer<typeof DeleteObjectsRequest>;

export const CopyObjectsRequest = z.object({
  sourceConnectionId: ConnectionId,
  sourceBucket: BucketName,
  sourceKeys: z.array(ObjectKey).min(1).max(1000),
  targetConnectionId: ConnectionId,
  targetBucket: BucketName,
  targetPath: FolderPath,
});
export type CopyObjectsRequest = z.infer<typeof CopyObjectsRequest>;

// Move and copy share their body shape; if the route file currently
// uses identical fields, alias rather than redeclare:
export const MoveObjectsRequest = CopyObjectsRequest;
export type MoveObjectsRequest = z.infer<typeof MoveObjectsRequest>;

export const RenameObjectRequest = z.object({
  connectionId: ConnectionId,
  bucket: BucketName,
  sourceKey: ObjectKey,
  targetKey: ObjectKey,
});
export type RenameObjectRequest = z.infer<typeof RenameObjectRequest>;
```

Caps (`max(1000)` on keys, `max(63)` on bucket name) come from S3
limits (`DeleteObjects` supports up to 1000 keys per request; bucket
names are 3–63 chars per AWS docs). The cap forms an extra safety
net beyond the route's existing checks.

Tests (`src/lib/schemas/objects.test.ts`): a small set verifying
the contract. ONE test per "happy path" + one per important
rejection per schema. Don't over-test zod itself; just verify the
shape.

Example for `DeleteObjectsRequest`:

```ts
test("accepts a minimal valid body", () => {
  const result = DeleteObjectsRequest.safeParse({
    connectionId: "00000000-0000-0000-0000-000000000000",
    bucket: "my-bucket",
    keys: ["a.txt"],
  });
  expect(result.success).toBe(true);
});

test("rejects empty keys", () => {
  const result = DeleteObjectsRequest.safeParse({
    connectionId: "00000000-0000-0000-0000-000000000000",
    bucket: "my-bucket",
    keys: [],
  });
  expect(result.success).toBe(false);
});

test("rejects non-uuid connectionId", () => {
  const result = DeleteObjectsRequest.safeParse({
    connectionId: "not-a-uuid",
    bucket: "my-bucket",
    keys: ["a.txt"],
  });
  expect(result.success).toBe(false);
});
```

4–6 tests per schema is plenty.

**Verify**: `pnpm test src/lib/schemas/objects.test.ts` passes.

### Step 4: Build the API-route test harness

Create `src/lib/test-utils/api-route.ts`. The harness must:

1. Build a `NextRequest`-shaped object that the route handler can read
   via `req.json()` and `req.nextUrl.searchParams`.
2. Provide a mocked `withAuth` user.
3. Let the route's `params` be passed in.

The simplest version:

```ts
import type { NextRequest } from "next/server";
import type { AuthUser } from "@/lib/auth/clerk";

/**
 * Build a minimal NextRequest-like stand-in for a POST handler.
 * Mock `@/lib/auth/protect.withAuth` and `@/lib/db/prisma` separately
 * with `vi.mock(...)` in each test file.
 */
export function buildPostRequest(opts: {
  url?: string;
  body: unknown;
  headers?: Record<string, string>;
}): NextRequest {
  const url = opts.url ?? "http://localhost/api/test";
  return {
    url,
    nextUrl: new URL(url),
    headers: new Headers(opts.headers),
    json: async () => opts.body,
    formData: async () => {
      throw new Error("formData not supported in this harness");
    },
    text: async () => JSON.stringify(opts.body),
  } as unknown as NextRequest;
}

export function buildAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  // Default to a minimally-shaped user. Tests can override fields.
  return {
    id: "user-1",
    clerkId: "clerk_user_1",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    imageUrl: null,
    subscription: { tier: "PRO" } as never, // tighten the type if AuthUser exposes it
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as unknown as AuthUser;
}
```

(Verify the `AuthUser` shape by reading `src/lib/auth/clerk.ts` at
planning time — adjust the field set so it satisfies the actual type.)

The harness deliberately does NOT mock `withAuth`. Tests do that
per-file with `vi.mock("@/lib/auth", () => ({ withAuth: (h) => h }))`,
which short-circuits the wrapper and passes the test's request +
synthetic user directly to the handler. This is much simpler than
mocking Clerk and Prisma, and matches the Vitest house style already
used in `src/app/api/webhooks/stripe/handler.test.ts`.

Tests for the harness itself (`api-route.test.ts`): minimal — just
prove the builder produces something the type system is happy with:

```ts
test("buildPostRequest exposes json() returning the original body", async () => {
  const req = buildPostRequest({ body: { foo: 1 } });
  expect(await req.json()).toEqual({ foo: 1 });
});

test("buildPostRequest exposes nextUrl.searchParams", () => {
  const req = buildPostRequest({ body: {}, url: "http://localhost/api/x?a=1" });
  expect(req.nextUrl.searchParams.get("a")).toBe("1");
});
```

**Verify**: `pnpm test src/lib/test-utils/api-route.test.ts` passes.

### Step 5: Migrate `delete/route.ts`

Replace the route body so it uses both new pieces:

```ts
import { NextResponse } from "next/server";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { withAuth } from "@/lib/auth";
import { requireConnectionAccess } from "@/lib/auth/require-connection-access";
import { recordActivityBatch } from "@/lib/db/activity";
import prisma from "@/lib/db/prisma";
import { indexBulkDelete } from "@/lib/search/index-ops"; // plan 006 already landed
import { DeleteObjectsRequest } from "@/lib/schemas/objects";

export const POST = withAuth(async (req, { user }) => {
  const parsed = DeleteObjectsRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }
  const { connectionId, bucket, keys } = parsed.data;

  const result = await requireConnectionAccess(connectionId, user.id, "write");
  if (result instanceof NextResponse) return result;
  const { access } = result;

  try {
    const client = createS3Client(access.connection);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((key) => ({ Key: key })), Quiet: true },
      })
    );

    await recordActivityBatch({
      connectionId,
      userId: user.id,
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "DELETE",
      bucket,
      items: keys.map((k) => ({ key: k })),
    });

    await indexBulkDelete({ connectionId, bucket, keys });

    try {
      await prisma.fileNote.deleteMany({
        where: { connectionId, bucket, key: { in: keys } },
      });
    } catch (err) {
      console.error("[notes] cascade delete failed:", err);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
```

Behavior is unchanged. `user.subscription` is intact (used by plan 001's
metering once that lands).

Write `delete/route.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  // withAuth becomes identity: the handler receives our user directly.
  withAuth: (handler: never) => handler,
}));
vi.mock("@/lib/db/connections", () => ({
  getConnectionAccessById: vi.fn(),
}));
vi.mock("@/lib/s3/client", () => ({
  createS3Client: vi.fn(),
}));
vi.mock("@/lib/db/activity", () => ({
  recordActivityBatch: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  default: { fileNote: { deleteMany: vi.fn() } },
}));
vi.mock("@/lib/search/index-ops", () => ({
  indexBulkDelete: vi.fn(),
}));

import { POST } from "./route";
import { buildPostRequest, buildAuthUser } from "@/lib/test-utils/api-route";
import { getConnectionAccessById } from "@/lib/db/connections";

beforeEach(() => {
  vi.clearAllMocks();
});

test("400 on missing connectionId", async () => {
  const req = buildPostRequest({ body: { bucket: "b", keys: ["k"] } });
  const res = await (POST as unknown as (r: typeof req, c: { user: ReturnType<typeof buildAuthUser> }) => Promise<Response>)(req, { user: buildAuthUser() });
  expect(res.status).toBe(400);
});

test("400 on empty keys", async () => {
  const req = buildPostRequest({ body: { connectionId: "00000000-0000-0000-0000-000000000000", bucket: "b", keys: [] } });
  const res = await POST(req as never, { user: buildAuthUser() } as never);
  expect(res.status).toBe(400);
});

test("404 when access lookup returns null", async () => {
  (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
  const req = buildPostRequest({ body: { connectionId: "00000000-0000-0000-0000-000000000000", bucket: "b", keys: ["k"] } });
  const res = await POST(req as never, { user: buildAuthUser() } as never);
  expect(res.status).toBe(404);
});

test("403 when role is VIEWER", async () => {
  (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    connection: { id: "00000000-0000-0000-0000-000000000000" },
    role: "VIEWER",
    workspaceId: "ws-1",
    workspaceType: "PERSONAL",
  });
  const req = buildPostRequest({ body: { connectionId: "00000000-0000-0000-0000-000000000000", bucket: "b", keys: ["k"] } });
  const res = await POST(req as never, { user: buildAuthUser() } as never);
  expect(res.status).toBe(403);
});

// Happy path test requires also mocking S3Client.send — keep it minimal.
test("200 when role is EDITOR; S3 delete is issued", async () => {
  const send = vi.fn().mockResolvedValue(undefined);
  const createS3ClientMock = (await import("@/lib/s3/client")).createS3Client as ReturnType<typeof vi.fn>;
  createS3ClientMock.mockReturnValueOnce({ send } as never);
  (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    connection: { id: "00000000-0000-0000-0000-000000000000" },
    role: "EDITOR",
    workspaceId: "ws-1",
    workspaceType: "PERSONAL",
  });
  const req = buildPostRequest({ body: { connectionId: "00000000-0000-0000-0000-000000000000", bucket: "b", keys: ["k1", "k2"] } });
  const res = await POST(req as never, { user: buildAuthUser() } as never);
  expect(res.status).toBe(200);
  expect(send).toHaveBeenCalledTimes(1);
});
```

5 tests is enough for this route. The "type cast" gymnastics at the
call site (`POST(req as never, … as never)`) are because the
`vi.mock("@/lib/auth")` returns a handler-shaped function rather than
the wrapper; if vitest type inference is unhappy, add a small
typed-cast helper in `api-route.ts`.

**Verify**: `pnpm test src/app/api/objects/delete/route.test.ts` → 5
passes. `pnpm typecheck && pnpm lint` → exit 0.

### Step 6: Migrate `rename/route.ts` (same shape as delete)

Same playbook: `safeParse(RenameObjectRequest)`, then
`requireConnectionAccess(connectionId, user.id, "write")`. The
sourceKey-folder-rejection guard at the current line 34 stays — it's
a domain rule the schema doesn't express. Move it AFTER the schema
parse and BEFORE the access check:

```ts
const { connectionId, bucket, sourceKey, targetKey } = parsed.data;

if (sourceKey === targetKey) {
  return NextResponse.json({ success: true, skipped: true });
}
if (sourceKey.endsWith("/")) {
  return NextResponse.json(
    { error: "Folder rename is not supported in bulk operations" },
    { status: 400 }
  );
}

const result = await requireConnectionAccess(connectionId, user.id, "write");
if (result instanceof NextResponse) return result;
const { access } = result;
```

Tests: same 5 shapes as delete (400 missing, 400 invalid, 400 folder,
404 access null, 403 viewer, 200 happy). Add one extra for the
short-circuit "sourceKey === targetKey" returning `{ skipped: true }`.

**Verify**: `pnpm test src/app/api/objects/rename/route.test.ts` → 6+ pass.

### Step 7: Migrate `copy/route.ts` (dual connection, write-on-target)

This is the asymmetric case. Parse the body once:

```ts
const parsed = CopyObjectsRequest.safeParse(await req.json().catch(() => null));
if (!parsed.success) {
  return NextResponse.json(
    { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
    { status: 400 }
  );
}
const {
  sourceConnectionId, sourceBucket, sourceKeys,
  targetConnectionId, targetBucket, targetPath,
} = parsed.data;
```

Then two access calls, with the asymmetric role:

```ts
const sourceResult = await requireConnectionAccess(sourceConnectionId, user.id, "read");
if (sourceResult instanceof NextResponse) {
  // Preserve the existing "Source connection not found" phrasing
  return sourceResult.status === 404
    ? NextResponse.json({ error: "Source connection not found" }, { status: 404 })
    : sourceResult;
}
const targetResult = await requireConnectionAccess(targetConnectionId, user.id, "write");
if (targetResult instanceof NextResponse) {
  // Distinguish target's 404
  return targetResult.status === 404
    ? NextResponse.json({ error: "Target connection not found" }, { status: 404 })
    : targetResult;
}
const { access: sourceAccess } = sourceResult;
const { access: targetAccess } = targetResult;
```

(The "Source/Target connection not found" disambiguation is observable
behavior the existing code preserves; keep it. If you decide the
generic "Connection not found" is fine for callers, that's a small
behavior change — defer to operator if unsure.)

The rest of the route body is unchanged. Index-bulk-upsert from plan
006 stays. Tests: 6 cases — 400 missing, 404 source null, 404 target
null, 403 viewer on target, 200 happy single-file, 200 happy folder.

**Verify**: `pnpm test src/app/api/objects/copy/route.test.ts` → 6+ pass.

### Step 8: Migrate `move/route.ts` (dual connection, write-on-both)

Same as copy, but both `sourceResult` and `targetResult` require
`"write"` (since move deletes from source). Comment at the call site:

```ts
// Move deletes from source after copy, so source also requires write.
const sourceResult = await requireConnectionAccess(sourceConnectionId, user.id, "write");
```

The 6 test cases mirror copy but with a "403 on source VIEWER" added.

**Verify**: `pnpm test src/app/api/objects/move/route.test.ts` → 7+ pass.

### Step 9: Final composite gate + behavior smoke

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

Expected: exit 0.

Smoke walk in `pnpm dev`:
1. Sign in. Open a folder. Delete a file. Confirm the file disappears
   and an activity row appears.
2. Copy a file across connections in the UI. Confirm it lands.
3. Move a file inside a bucket. Confirm source vanishes, target appears.
4. Rename a file. Confirm.
5. As a VIEWER (impersonate via another team member): try delete /
   copy / move / rename. Confirm 403 with the existing toast text.

If the smoke walk surfaces a behavior change vs `main`, STOP.

## Test plan

New tests added in this plan:

- `src/lib/auth/require-connection-access.test.ts` — 7 cases.
- `src/lib/schemas/objects.test.ts` — ~20 cases (4–6 per schema × 4 schemas).
- `src/lib/test-utils/api-route.test.ts` — 2 cases.
- `src/app/api/objects/delete/route.test.ts` — 5 cases.
- `src/app/api/objects/copy/route.test.ts` — 6+ cases.
- `src/app/api/objects/move/route.test.ts` — 7+ cases.
- `src/app/api/objects/rename/route.test.ts` — 6+ cases.

Total new ≈ 50–60 tests. `pnpm test` count rises accordingly (from
462 baseline).

## Done criteria

ALL must hold:

- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` all exit 0.
- [ ] `grep -rn "getConnectionAccessById" src/app/api/objects/{delete,copy,move,rename}` → 0 hits (all migrated to `requireConnectionAccess`).
- [ ] `grep -rn "requireConnectionAccess" src/app/api/objects/{delete,copy,move,rename}` → 4+ hits (one per route, two in `copy` and `move`).
- [ ] `grep -rn "from \"@/lib/schemas/objects\"" src/app/api/objects/{delete,copy,move,rename}` → 4 hits (one per route).
- [ ] `zod` appears in `package.json` `dependencies`.
- [ ] All four route test files exist and contain at least the cases enumerated above.
- [ ] No source files outside the Scope section's "in scope" list are modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- `AuthUser` (declared in `src/lib/auth/clerk.ts`) has fields that
  `buildAuthUser` can't satisfy. Read the type; if it pulls more than
  ~10 fields from `User`-shape, simplify the harness mock instead of
  forcing a perfect type.
- The "Source/Target connection not found" disambiguation in copy/move
  proves brittle — if you find that no test asserts on the distinct
  phrasing AND the operator gives the OK, collapse to the generic
  message. Otherwise keep the disambiguation.
- A migrated route changes any externally-observable behavior beyond
  the validation strictness (uuid format on `connectionId`, key length
  caps). The plan is intentionally behavior-preserving — extra cleanups
  are for follow-up plans.
- `zod`'s install pulls in heavyweight transitive deps. It shouldn't —
  zod is dep-free — but verify with `pnpm list zod` after install.
- Any of the smoke-walk flows in Step 9 fails on `pnpm dev`.

## Maintenance notes

- The pattern lands on 4 of ~20 routes that share the shape. Follow-up
  plans should each cover a small batch:
  - Plan N+1: `folder`, `tag`, `metadata` (POST), `head`.
  - Plan N+2: `download`, `presign-batch`, `download-zip`.
  - Plan N+3: `versions/{copy,presign,purge,restore,undelete}`.
  - Plan N+4: `multipart/{create,sign-parts,complete}`.
- Whichever team takes a follow-up should NOT consolidate the
  source/target 404 messaging in `copy`/`move` without checking
  callers — the UI may depend on distinct strings.
- `requireConnectionAccess` currently inlines the connection-fetch +
  role check. If the helper grows new requirements (e.g. workspace
  membership check), prefer adding flags rather than splitting into
  multiple helpers — the call sites get noisy fast.
- `zod` schemas should remain co-located by domain area
  (`src/lib/schemas/objects.ts`, future `share-links.ts`,
  `connections.ts`). Resist exporting from a single barrel — explicit
  imports make grep-ability matter.
- Reviewer focus: confirm copy/move's role-on-source vs role-on-target
  hasn't changed (the audit found this asymmetry was deliberate). The
  test suite has explicit cases for both — verify they assert the
  right side.
