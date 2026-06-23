# Plan 043: Resolve connection list access in one query and stop decrypting secrets the list never returns

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/app/api/connections/route.ts src/lib/db/connections.ts`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

`GET /api/connections` (the dashboard connections list) currently issues
**1 + N database round-trips and N AES decryptions** for a user with N
connections: one `findMany` to list them, then a separate `findUnique`
**plus** a `decrypt()` of the secret key for *each* connection. The decrypted
secret is then thrown away — the list response strips secrets — so every
decrypt is pure wasted CPU. This endpoint runs on every dashboard/app load,
and its latency grows linearly with how many connections a user (or team) has.
A single `findMany` with the right `include` returns everything the list needs
(role, workspace type) with **zero** decryptions and **one** query.

## Current state

Two files are involved.

**`src/app/api/connections/route.ts`** — the GET handler (lines 17–43). It
lists connections, then re-resolves each one through `getConnectionAccessById`
inside a `Promise.all`:

```ts
// GET /api/connections - List user's connections
export const GET = withAuth(async (req, { user }) => {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId") || undefined;
  const connections = await getConnectionsByUserId(user.id, workspaceId);

  // Don't expose secret keys in the list response
  const accessEntries = await Promise.all(
    connections.map((conn) => getConnectionAccessById(conn.id, user.id))   // <-- N+1: one findUnique + one decrypt() per connection
  );

  const safeConnections = accessEntries
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => ({
      id: entry.connection.id,
      name: entry.connection.name,
      endpoint: entry.connection.endpoint,
      region: entry.connection.region,
      accessKeyId: entry.connection.accessKeyId,
      forcePathStyle: entry.connection.forcePathStyle,
      workspaceId: entry.workspaceId,
      workspaceType: entry.workspaceType,
      role: entry.role,
      createdAt: entry.connection.createdAt,
      updatedAt: entry.connection.updatedAt,
    }));

  return NextResponse.json(safeConnections);
});
```

**`src/lib/db/connections.ts`** — the data layer. Three pieces matter:

1. `getRoleForWorkspace(userId, workspace)` (lines 31–44) — a **pure**
   function that derives the user's role from a workspace-with-team-members
   shape. This is exactly the logic we need, and it works on the `include`
   shape below. It is currently **not exported**.

   ```ts
   function getRoleForWorkspace(
     userId: string,
     workspace: {
       type: "PERSONAL" | "TEAM";
       userId: string | null;
       team: { members: Array<{ role: Role }> } | null;
     }
   ): ConnectionRole | null {
     if (workspace.type === "PERSONAL") {
       return workspace.userId === userId ? "ADMIN" : null;
     }
     return workspace.team?.members[0]?.role ?? null;
   }
   ```

2. `getConnectionsByUserId(userId, workspaceId?)` (lines 92–131) — returns
   plain `Connection[]` with **no** workspace/role data, which is why the route
   has to re-fetch each one. Note the two branches: workspace-scoped (after a
   `getWorkspaceAccess` check) and the "all accessible" `OR` filter.

3. `getConnectionAccessById(id, userId)` (lines 136–186) — single-connection
   resolver. It does `findUnique` with a `workspace.include.team.include.members`
   join **and** calls `decrypt(connection.secretAccessKey)` (line 175). Keep this
   function unchanged — single-connection callers (`getConnectionById`,
   `updateConnection`, `deleteConnection`) legitimately need the decrypted secret.

The `decrypt` import is at `src/lib/db/connections.ts:3`
(`import { encrypt, decrypt } from "@/lib/crypto";`).

### Repo conventions to follow

- **Data-layer functions live in `src/lib/db/*.ts`** and return typed shapes
  (see the existing `ConnectionAccess` type at lines 24–29).
- **Tests for the data layer mock Prisma** with `vi.mock("@/lib/db/prisma", …)`
  and assert on call arguments. Model the new test exactly on
  `src/lib/db/bookmarks.test.ts` (lines 1–55) — same mock structure,
  `beforeEach(() => vi.clearAllMocks())`, and `as ReturnType<typeof vi.fn>`
  casts on the mocked methods.
- The `include` shape for resolving role is already proven in
  `getConnectionAccessById` (lines 142–156) and `getWorkspaceAccess`
  (lines 63–73): `workspace → team → members (where: { userId }, take: 1)`.

## Commands you will need

| Purpose   | Command                                         | Expected on success      |
|-----------|-------------------------------------------------|--------------------------|
| Typecheck | `pnpm typecheck`                                | exit 0, no errors        |
| Tests     | `pnpm test src/lib/db/connections.test.ts`      | all pass                 |
| Full test | `pnpm test`                                     | all pass                 |
| Lint      | `pnpm lint`                                      | exit 0                   |

## Scope

**In scope** (the only files you should modify or create):
- `src/lib/db/connections.ts` (add one new function; export `getRoleForWorkspace`)
- `src/app/api/connections/route.ts` (GET handler only)
- `src/lib/db/connections.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):
- `getConnectionAccessById` — leave it exactly as is; single-connection callers
  rely on its decrypted-secret return.
- `getConnectionsByUserId` — leave it; other callers may use it. Add a new
  function rather than changing its return type.
- The POST handler in `route.ts` — unrelated to this perf fix.
- The response field set / shape — the safe-connection object keys must remain
  identical (clients depend on them).

## Git workflow

- Branch: `advisor/043-connections-list-n-plus-1`
- Commit message style: conventional commits (repo uses `perf:`, `refactor:`,
  `fix:` prefixes — e.g. `perf: resolve connection list access in a single query`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Export the pure role helper

In `src/lib/db/connections.ts`, change the declaration of `getRoleForWorkspace`
(line 31) from `function getRoleForWorkspace(` to
`export function getRoleForWorkspace(`. No other change to that function.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Add a single-query list-with-access resolver

In `src/lib/db/connections.ts`, add a new exported function (place it directly
after `getConnectionsByUserId`, before `getConnectionAccessById`). It must
return the same per-connection access data the list route needs, in ONE
`findMany`, and must **never** call `decrypt`.

Target shape (the connection object intentionally omits `secretAccessKey`):

```ts
export type ConnectionListEntry = {
  connection: {
    id: string;
    name: string | null;
    endpoint: string;
    region: string;
    accessKeyId: string;
    forcePathStyle: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  workspaceId: string;
  workspaceType: "PERSONAL" | "TEAM";
  role: ConnectionRole;
};

/**
 * List all connections a user can access, with role + workspace metadata
 * resolved in a single query. Does NOT decrypt secrets — for list views that
 * never expose the secret key. Use getConnectionAccessById for single-connection
 * operations that need the decrypted secret.
 */
export async function listConnectionsWithAccess(
  userId: string,
  workspaceId?: string
): Promise<ConnectionListEntry[]> {
  const include = {
    workspace: {
      include: {
        team: {
          include: {
            members: {
              where: { userId },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    },
  } as const;

  let rows;
  if (workspaceId) {
    const access = await getWorkspaceAccess(workspaceId, userId);
    if (!access) return [];
    rows = await prisma.connection.findMany({
      where: { workspaceId },
      include,
      orderBy: { createdAt: "desc" },
    });
  } else {
    rows = await prisma.connection.findMany({
      where: {
        OR: [
          { workspace: { type: "PERSONAL", userId } },
          {
            workspace: {
              type: "TEAM",
              team: { members: { some: { userId } } },
            },
          },
        ],
      },
      include,
      orderBy: { createdAt: "desc" },
    });
  }

  return rows
    .map((row) => {
      const role = getRoleForWorkspace(userId, row.workspace);
      if (!role) return null;
      return {
        connection: {
          id: row.id,
          name: row.name,
          endpoint: row.endpoint,
          region: row.region,
          accessKeyId: row.accessKeyId,
          forcePathStyle: row.forcePathStyle,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
        workspaceId: row.workspace.id,
        workspaceType: row.workspace.type,
        role,
      };
    })
    .filter((e): e is ConnectionListEntry => e !== null);
}
```

If TypeScript complains that `row.workspace` is possibly `null` (the relation is
required in the schema, but the generated type may be nullable), guard with
`if (!row.workspace) return null;` before calling `getRoleForWorkspace`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Switch the GET route to the new resolver

In `src/app/api/connections/route.ts`, replace the body of the GET handler
(the `getConnectionsByUserId` + `Promise.all(... getConnectionAccessById ...)`
block, lines 18–42) with a single call. Update the import on lines 3–10 to bring
in `listConnectionsWithAccess` and **remove** the now-unused `getConnectionsByUserId`
and `getConnectionAccessById` imports **only if** nothing else in this file uses
them (the POST handler uses `getWorkspaceAccess`, `ensurePersonalWorkspace`,
`createConnection`, `canCreateConnection` — keep those).

New GET body:

```ts
export const GET = withAuth(async (req, { user }) => {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId") || undefined;
  const entries = await listConnectionsWithAccess(user.id, workspaceId);

  // Secrets are never resolved or returned for the list view.
  const safeConnections = entries.map((entry) => ({
    id: entry.connection.id,
    name: entry.connection.name,
    endpoint: entry.connection.endpoint,
    region: entry.connection.region,
    accessKeyId: entry.connection.accessKeyId,
    forcePathStyle: entry.connection.forcePathStyle,
    workspaceId: entry.workspaceId,
    workspaceType: entry.workspaceType,
    role: entry.role,
    createdAt: entry.connection.createdAt,
    updatedAt: entry.connection.updatedAt,
  }));

  return NextResponse.json(safeConnections);
});
```

The output object keys must be byte-for-byte the same as before. Confirm by
comparing against the "Current state" excerpt.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0 (no
`unused import` errors).

### Step 4: Add a test proving the N+1 and the decrypt are gone

Create `src/lib/db/connections.test.ts`. Model the mock structure on
`src/lib/db/bookmarks.test.ts`. Mock `@/lib/db/prisma` (with
`connection.findMany`, `workspace.findUnique` — the latter is used by
`getWorkspaceAccess`) and mock `@/lib/crypto` so you can assert `decrypt` is
never called.

```ts
import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  default: {
    connection: { findMany: vi.fn() },
    workspace: { findUnique: vi.fn() },
  },
}));

const decryptSpy = vi.fn();
vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn(),
  decrypt: (...args: unknown[]) => decryptSpy(...args),
}));

import prisma from "@/lib/db/prisma";
import { listConnectionsWithAccess } from "./connections";

beforeEach(() => {
  vi.clearAllMocks();
  decryptSpy.mockReset();
});

const personalRow = {
  id: "c1", name: "Personal", endpoint: "https://e", region: "us-east-1",
  accessKeyId: "AK", secretAccessKey: "ENC", forcePathStyle: true,
  workspaceId: "ws1", createdById: "u1",
  createdAt: new Date(0), updatedAt: new Date(0),
  workspace: { id: "ws1", type: "PERSONAL", userId: "u1", team: null },
};

const teamRow = {
  id: "c2", name: "Team", endpoint: "https://e2", region: "eu-west-1",
  accessKeyId: "AK2", secretAccessKey: "ENC2", forcePathStyle: false,
  workspaceId: "ws2", createdById: "u9",
  createdAt: new Date(0), updatedAt: new Date(0),
  workspace: { id: "ws2", type: "TEAM", userId: null, team: { members: [{ role: "VIEWER" }] } },
};

describe("listConnectionsWithAccess", () => {
  test("resolves all connections in a single findMany (no N+1)", async () => {
    (prisma.connection.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([personalRow, teamRow]);

    const result = await listConnectionsWithAccess("u1");

    expect(prisma.connection.findMany).toHaveBeenCalledOnce();
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("ADMIN");      // PERSONAL owner
    expect(result[1].role).toBe("VIEWER");     // TEAM member role
    expect(result[1].workspaceType).toBe("TEAM");
  });

  test("never decrypts secrets for the list view", async () => {
    (prisma.connection.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([personalRow]);
    await listConnectionsWithAccess("u1");
    expect(decryptSpy).not.toHaveBeenCalled();
  });

  test("filters out connections where the user has no role", async () => {
    const foreignPersonal = { ...personalRow, workspace: { id: "ws9", type: "PERSONAL", userId: "someone-else", team: null } };
    (prisma.connection.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([foreignPersonal]);
    const result = await listConnectionsWithAccess("u1");
    expect(result).toHaveLength(0);
  });
});
```

If the mock object's `type`/`role` string literals trigger TS errors in the
test, add `as const` to the `workspace` literal or cast the row arrays to
`any[]` at the `mockResolvedValue` call — test fixtures casting to `any` is
acceptable here; do NOT add `any` in `connections.ts`.

**Verify**: `pnpm test src/lib/db/connections.test.ts` → all 3 tests pass.

### Step 5: Full gate

**Verify**:
- `pnpm typecheck` → exit 0
- `pnpm test` → all pass (including the 3 new tests)
- `pnpm lint` → exit 0

## Test plan

- New file `src/lib/db/connections.test.ts` with three cases:
  1. happy path — one `findMany`, correct roles for PERSONAL + TEAM (proves N+1 gone);
  2. regression — `decrypt` never called (proves wasted-decrypt gone);
  3. edge — connection the user can't access is filtered out.
- Structural pattern: `src/lib/db/bookmarks.test.ts`.
- Verification: `pnpm test src/lib/db/connections.test.ts` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; the 3 new `connections.test.ts` tests pass
- [ ] `pnpm lint` exits 0
- [ ] `src/app/api/connections/route.ts` GET no longer calls
      `getConnectionAccessById` (grep: `grep -n "getConnectionAccessById" src/app/api/connections/route.ts` → no matches)
- [ ] The safe-connection response object has the same keys as before
      (`id, name, endpoint, region, accessKeyId, forcePathStyle, workspaceId,
      workspaceType, role, createdAt, updatedAt`)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts
  (the codebase drifted since this plan was written).
- The generated Prisma type for `connection.findMany(... include ...)` does not
  expose `workspace.team.members` the way `getConnectionAccessById` consumes it
  (i.e. the include shape no longer typechecks) — report the type error.
- `getRoleForWorkspace` has changed signature or been removed.
- A verification command fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.

## Maintenance notes

- If the connections list ever needs the secret key (it should not — that would
  be a secret-exposure regression), do NOT add `decrypt` here; route that
  through a single-connection call instead.
- If pagination is added to the connections list, `listConnectionsWithAccess`
  is the place to add `skip`/`take`; the role derivation stays per-row.
- Reviewer should scrutinize: (a) that the response key set is unchanged, and
  (b) that the `OR` access filter in the new function matches the old
  `getConnectionsByUserId` filter exactly (same PERSONAL/TEAM branches), so no
  connection silently appears or disappears from the list.
- The same 1+N pattern does **not** exist for buckets/objects; this was specific
  to the connections list.
