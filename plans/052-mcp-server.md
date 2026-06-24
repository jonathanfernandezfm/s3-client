# Plan 052: MCP server exposing S3 operations through S3Dock (read-only MVP)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 96f1d63..HEAD -- src/lib/s3/client.ts src/lib/db/connections.ts src/lib/subscriptions src/lib/roles.ts src/app/api/objects/route.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (new standalone process + new runtime deps; no change to the web app)
- **Depends on**: **plans/051-mcp-personal-access-tokens.md** (must land first)
- **Category**: direction / dx (new integration surface)
- **Planned at**: commit `96f1d63`, 2026-06-24

## Why this matters

S3Dock already isolates all S3 logic behind a thin library layer, so exposing
it to an AI assistant over the **Model Context Protocol** is mostly wiring, not
new logic. An MCP server lets a user ask an assistant to "list the objects
under `logs/` in my prod bucket" or "give me a download link for `report.pdf`"
and have it execute against their real connections — with the **same
authorization, metering, and credential encryption** the web app enforces,
because this server reuses those exact functions in-process. This plan ships a
**read-only MVP** (list connections/buckets/objects, head an object, presign a
download). Mutating tools (upload/delete/copy/move) are deliberately deferred to
a follow-up so the first version has no destructive surface.

## Feasibility note (why this is low-risk to build)

Verified during planning at `96f1d63`:
- The reused chain `getConnectionAccessById → prisma/crypto/roles` and
  `meterOperation → check-limits/usage → prisma` imports **nothing** from
  `next/*` or `server-only` — it runs in a plain Node process. (Confirmed by
  grep over those files.)
- `createS3Client(config)` (`src/lib/s3/client.ts:11`) is a pure factory over
  `@aws-sdk/client-s3`, already a dependency.
- Path alias `@/* → ./src/*` (`tsconfig.json`) is honored by `tsx` at runtime,
  so the server can `import { ... } from "@/lib/..."` like the rest of the app.

## Current state

The facts the executor needs, inlined:

- **S3 client factory** — `src/lib/s3/client.ts:11`:
  ```ts
  export function createS3Client(connection: S3ClientConfig): S3Client { ... }
  // S3ClientConfig = { endpoint, accessKeyId, secretAccessKey, region?, forcePathStyle? }
  ```
- **Connection access + decrypt + role** — `src/lib/db/connections.ts:229`
  `getConnectionAccessById(id, userId)` returns
  `{ connection: {...decrypted secretAccessKey...}, workspaceId, workspaceType, role }`
  or `null` if the user has no access. `userId` is the **internal** `User.id`.
- **List connections for a user** — `src/lib/db/connections.ts:155`
  `listConnectionsWithAccess(userId)` returns `{ connection: {id,name,endpoint,region,...}, role }[]`
  **without** decrypting secrets. Use this for the `list_connections` tool.
- **Role helpers** — `src/lib/roles.ts`: `canManageFiles(role)` (ADMIN/EDITOR),
  `canManageConnections(role)` (ADMIN). Read operations need no gate beyond
  having access (VIEWER is allowed). **Do not import `requireConnectionAccess`**
  (`src/lib/auth/require-connection-access.ts`) — it returns a `NextResponse`
  and is HTTP-coupled. Gate with the role helpers directly.
- **Metering** — `src/lib/subscriptions/metering.ts:10`
  `meterOperation(userId, tier)` returns `{ allowed, reason? }` and records one
  operation when allowed. Tier comes from `user.subscription?.tier ?? "FREE"`.
  The web routes call this before each S3 op (see `src/app/api/objects/route.ts:38-42`);
  mirror that.
- **Reference route to mirror** — `src/app/api/objects/route.ts:44-75` shows the
  exact `ListObjectsV2Command` usage (Delimiter `/`, MaxKeys 1000,
  CommonPrefixes → folders, Contents → files), including filtering the prefix
  itself out of `Contents`.
- **PAT resolver (from plan 051)** — `resolveMcpToken(rawToken): Promise<AuthUser | null>`
  re-exported from `src/lib/auth` (`src/lib/auth/index.ts`). Returns a `User`
  with `subscription` included.
- **No MCP SDK is installed yet** (`ls node_modules/@modelcontextprotocol` →
  absent). `zod` **is** already a dependency.
- **Existing scripts** live in `scripts/` and are run by `node`; this server is
  a TS entrypoint run by `tsx` (added in Step 1) so it can use the `@/` alias.

## Commands you will need

| Purpose            | Command                                          | Expected on success |
|--------------------|--------------------------------------------------|---------------------|
| Install deps       | `pnpm add @modelcontextprotocol/sdk` then `pnpm add -D tsx` | exit 0 |
| Typecheck          | `pnpm typecheck`                                 | exit 0, no errors   |
| Lint               | `pnpm lint`                                       | exit 0              |
| Smoke-run server   | `S3DOCK_MCP_TOKEN=bad pnpm mcp`                  | exits non-zero with a clear "invalid token" message |
| MCP Inspector (opt)| `npx @modelcontextprotocol/inspector pnpm mcp`  | tools list renders  |

The active repo gate (per `plans/README.md`):
`pnpm test && pnpm typecheck && pnpm lint` → exit 0.

## Suggested executor toolkit

- The MCP TypeScript SDK README (the `McpServer` + `StdioServerTransport` +
  `server.registerTool` API). Read it before Step 2; the API names below are
  the load-bearing contract.

## Scope

**In scope** (create/modify):
- `src/mcp/server.ts` (create — entrypoint, stdio transport)
- `src/mcp/tools.ts` (create — tool handlers reusing the lib layer)
- `src/mcp/auth.ts` (create — resolve `S3DOCK_MCP_TOKEN` once at startup)
- `package.json` (add deps + an `"mcp": "tsx src/mcp/server.ts"` script)
- `README.md` or a new `docs/mcp.md` (create — how to configure the server)
- `.env.example` (document `S3DOCK_MCP_TOKEN`)

**Out of scope** (do NOT touch):
- Any `src/app/**` route or React component — the web app does not change.
- `src/lib/**` — reuse it read-only; do not modify lib functions. (If a lib
  signature seems wrong, that's a STOP condition, not an edit.)
- **Mutating S3 tools** (upload, delete, copy, move, folder create, tags,
  versioning) — explicitly deferred to a follow-up plan. This MVP is read-only.
- A remote/HTTP MCP transport — stdio only for the MVP.

## Git workflow

- Branch: `advisor/052-mcp-server`
- Conventional-commit messages (e.g. `feat: add read-only MCP server for S3 operations`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add dependencies and the run script

Run `pnpm add @modelcontextprotocol/sdk` and `pnpm add -D tsx`. In
`package.json` `scripts`, add:
```json
"mcp": "tsx src/mcp/server.ts"
```

**Verify**: `pnpm typecheck` → exit 0 (deps resolve); `node -e "require.resolve('@modelcontextprotocol/sdk/server/mcp.js')"` → exit 0.

### Step 2: Startup auth (`src/mcp/auth.ts`)

The stdio server is **single-user per process** (one token → one user). Resolve
it once at boot:

```ts
import { resolveMcpToken } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth"; // if AuthUser is exported there; else from "@/lib/auth/clerk"

export async function authenticateFromEnv(): Promise<AuthUser> {
  const raw = process.env.S3DOCK_MCP_TOKEN;
  if (!raw) {
    throw new Error("S3DOCK_MCP_TOKEN is not set. Mint one with scripts/issue-mcp-token.js.");
  }
  const user = await resolveMcpToken(raw);
  if (!user) {
    throw new Error("S3DOCK_MCP_TOKEN is invalid, revoked, or expired.");
  }
  return user;
}
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Tool handlers (`src/mcp/tools.ts`)

Export pure async functions, each taking the resolved `user` plus typed args,
reusing the lib layer. Implement these five (read-only):

1. **`listConnections(user)`** — call `listConnectionsWithAccess(user.id)`;
   map to `{ id, name, endpoint, region, role }[]`. No metering (cheap DB read,
   no S3 call) — matches the web `GET /api/connections` which doesn't meter.

2. **`listBuckets(user, { connectionId })`** —
   `const access = await getConnectionAccessById(connectionId, user.id);`
   `if (!access) throw new Error("Connection not found")`;
   meter (`meterOperation(user.id, user.subscription?.tier ?? "FREE")`, throw
   `meter.reason` if `!allowed`); `createS3Client(access.connection)`;
   `new ListBucketsCommand({})`; return `{ name, creationDate }[]`.

3. **`listObjects(user, { connectionId, bucket, prefix?, continuationToken? })`** —
   same access + meter preamble, then mirror `src/app/api/objects/route.ts:44-75`
   exactly (Delimiter `/`, MaxKeys 1000, fold `CommonPrefixes`→folders and
   `Contents`→files, drop the prefix row). Return
   `{ objects, isTruncated, nextContinuationToken }`.

4. **`headObject(user, { connectionId, bucket, key })`** — access + meter, then
   `new HeadObjectCommand({ Bucket, Key })`; return a compact object:
   `{ contentType, contentLength, etag, lastModified, storageClass, metadata }`
   (`metadata` = the `Metadata` map). Map a `NotFound`/`404` SDK error to a
   clean `throw new Error("Object not found")`.

5. **`presignDownload(user, { connectionId, bucket, key, expiresIn? })`** —
   access + meter, then
   `getSignedUrl(client, new GetObjectCommand({ Bucket, Key }), { expiresIn: clamp(expiresIn ?? 900, 60, 3600) })`
   from `@aws-sdk/s3-request-presigner` (already a dependency). Return `{ url, expiresIn }`.
   This is the read-side download path; it requires only read access.

Every handler that hits S3 must be wrapped so AWS SDK errors surface as
`Error(message)` (the MCP layer turns thrown errors into tool errors). Do NOT
leak `access.connection.secretAccessKey` into any return value or error string.

**Authorization for the MVP**: all five tools are reads → having access
(`getConnectionAccessById` non-null, i.e. VIEWER+) is sufficient. Do not call
`canManageFiles`/`canManageConnections` here; they belong to the deferred
mutating tools.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Server entrypoint (`src/mcp/server.ts`)

Wire the stdio MCP server, authenticate once, then register the five tools with
`zod` input schemas. Shape (use the SDK's current API — verify names against the
installed SDK):

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { authenticateFromEnv } from "./auth";
import * as tools from "./tools";

async function main() {
  const user = await authenticateFromEnv(); // throws & exits if bad token

  const server = new McpServer({ name: "s3dock", version: "0.1.0" });

  server.registerTool(
    "list_connections",
    { description: "List the S3 connections this user can access.", inputSchema: {} },
    async () => ({ content: [{ type: "text", text: JSON.stringify(await tools.listConnections(user)) }] })
  );

  server.registerTool(
    "list_objects",
    {
      description: "List folders and objects under a prefix in a bucket.",
      inputSchema: {
        connectionId: z.string(),
        bucket: z.string(),
        prefix: z.string().optional(),
        continuationToken: z.string().optional(),
      },
    },
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await tools.listObjects(user, args)) }] })
  );
  // ...list_buckets, head_object, presign_download likewise.

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  // stdout is the MCP channel — log diagnostics to stderr only.
  console.error(`[s3dock-mcp] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
```

**Critical**: never `console.log` to stdout — stdio transport uses stdout for
the protocol. All diagnostics go to `console.error` (stderr).

**Verify**: `S3DOCK_MCP_TOKEN=bad pnpm mcp` → process exits non-zero and prints
`invalid, revoked, or expired` to stderr (proves auth gating + that the import
chain loads under `tsx` without a `next/server-only` crash). With a **valid**
token (minted via plan 051's script) and a populated `.env`, optionally run
`npx @modelcontextprotocol/inspector pnpm mcp` and confirm the five tools list
and `list_connections` returns the user's connections.

### Step 5: Document configuration

Add `docs/mcp.md` (and a short pointer from `README.md`): how to mint a token
(`node scripts/issue-mcp-token.js <email> <name>`), the required env
(`DATABASE_URL`, `ENCRYPTION_KEY`, `S3DOCK_MCP_TOKEN`), and a Claude Desktop
`mcpServers` snippet:

```json
{
  "mcpServers": {
    "s3dock": {
      "command": "pnpm",
      "args": ["mcp"],
      "cwd": "/absolute/path/to/s3client",
      "env": {
        "DATABASE_URL": "postgres://...",
        "ENCRYPTION_KEY": "<64-hex>",
        "S3DOCK_MCP_TOKEN": "s3dock_pat_..."
      }
    }
  }
}
```

Add `S3DOCK_MCP_TOKEN=` to `.env.example` with a one-line comment.

**Verify**: `grep -n "S3DOCK_MCP_TOKEN" .env.example docs/mcp.md` → matches in both.

## Test plan

- Unit-test `src/mcp/tools.ts` in `src/mcp/tools.test.ts`: mock `getConnectionAccessById`,
  `meterOperation`, and the S3 client `send` (model the mocking after an existing
  lib test such as `src/lib/s3/security-posture.test.ts` — read it first). Cover:
  - `listObjects` maps CommonPrefixes→folders and Contents→files and drops the
    prefix row (the exact transform from `objects/route.ts`);
  - a tool throws `"Connection not found"` when `getConnectionAccessById` returns
    `null`;
  - a tool throws the meter reason when `meterOperation` returns `{ allowed: false }`;
  - no return value contains `secretAccessKey`.
- The end-to-end stdio handshake is verified manually via the Inspector (Step 4);
  do not attempt to spawn the transport inside vitest.
- Verification: `pnpm test -- mcp` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test -- mcp` passes; `src/mcp/tools.test.ts` exists with the cases above
- [ ] `S3DOCK_MCP_TOKEN=bad pnpm mcp` exits non-zero with an "invalid…token" stderr message
- [ ] `grep -rn "console.log" src/mcp/` returns no matches (stdout is reserved for the protocol)
- [ ] `grep -rn "secretAccessKey" src/mcp/` returns no matches (secrets never surfaced)
- [ ] `package.json` has an `"mcp"` script and `@modelcontextprotocol/sdk` in dependencies
- [ ] No files under `src/app/` or `src/lib/` were modified (`git status`)
- [ ] `plans/README.md` status row for 052 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 051 has not landed (`resolveMcpToken` is not exported from `src/lib/auth`).
  052 depends on it; do not reimplement token resolution here.
- Importing `@/lib/...` under `tsx` throws because something in the chain pulls
  `next/*` or `server-only` (it should not, per the feasibility note — if it
  does, the chain drifted; report the offending module instead of stubbing it).
- The installed `@modelcontextprotocol/sdk` exposes a materially different API
  than the `McpServer`/`registerTool`/`StdioServerTransport` shape above —
  adapt to the installed version's documented API, and if it's ambiguous, stop
  and report which SDK version is installed.
- `getConnectionAccessById` or `meterOperation` signatures differ from the
  excerpts (drift) — stop, don't guess.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

For the human/agent who owns this after it lands:

- **Deferred follow-up — mutating tools**: `upload_object`, `delete_object(s)`,
  `copy`/`move`, `create_folder`, tag edits. Each must gate on
  `canManageFiles(access.role)` (throw on VIEWER) and record activity via
  `recordActivity` the way the web routes do — design those tools to mirror the
  corresponding `src/app/api/objects/*` route, including activity logging, which
  this read-only MVP skips.
- **Deferred — remote transport**: a hosted, multi-user MCP server (streamable
  HTTP + per-request `Bearer` token via `resolveMcpToken`). The single-user
  stdio model here is the local MVP; the resolver from 051 is already
  transport-agnostic so this is mostly transport wiring + per-request user
  resolution instead of once-at-boot.
- **Reviewer focus**: (1) nothing writes to stdout except the protocol; (2) no
  secret or full connection object is ever returned or logged; (3) every S3 tool
  meters before the call, matching the web app's quota behavior; (4) read tools
  stay read-only (no `Put`/`Delete`/`Copy` commands sneak in).
- **Metering interaction**: this server consumes the same monthly operation
  quota as the web app (plan 001). Heavy assistant use will draw down a user's
  tier limit — intended, but worth noting in user-facing docs.
