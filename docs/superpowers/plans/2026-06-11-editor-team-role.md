# EDITOR Team Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third team role, EDITOR, that sits between ADMIN and VIEWER: editors can manage files (upload, delete, copy, move, rename, folders, tags, version restore/undelete/copy, abort multipart uploads) but cannot manage infrastructure (connections, bucket create/delete, bucket versioning, permanent version purge) or team membership.

**Architecture:** Add `EDITOR` to the Prisma `TeamRole` enum (additive Postgres migration). Introduce a tiny shared role module `src/lib/roles.ts` exporting the `Role` union and `canManageFiles` / `canManageConnections` predicates, usable from both server routes and client components. Replace scattered `role !== "ADMIN"` checks in *file-level* API routes and UI gates with `canManageFiles(role)`; leave infrastructure-level checks (`connections`, bucket create/delete, versioning toggle, purge, team management) as ADMIN-only. Extend the existing `canPerformVersionAction` helper so EDITOR gets write-level version actions.

**Tech Stack:** Next.js 16 App Router, Prisma (PostgreSQL), TypeScript, Vitest, React Query, Zustand.

---

## Permission Matrix (the spec)

| Capability | ADMIN | EDITOR | VIEWER |
|---|---|---|---|
| Browse/download objects, presign, list versions | ✅ | ✅ | ✅ |
| Upload, delete, copy, move, rename objects; create folders; edit tags | ✅ | ✅ | ❌ |
| Version restore / undelete / version copy | ✅ | ✅ | ❌ |
| Abort multipart uploads | ✅ | ✅ | ❌ |
| Version purge (permanent destroy) | ✅ | ❌ | ❌ |
| Bucket create / delete | ✅ | ❌ | ❌ |
| Bucket versioning enable/suspend | ✅ | ❌ | ❌ |
| Connection create/update/delete/test/import/health-check | ✅ | ❌ | ❌ |
| Team member add/remove/change-role | ✅ | ❌ | ❌ |
| Notes: create own / edit+delete own | ✅ | ✅ | ✅ (unchanged) |
| Notes: moderate (edit/delete others') | ✅ | ❌ | ❌ (unchanged) |

Personal workspaces always resolve to ADMIN (unchanged). The "team must keep at least one admin" rule now applies to any demotion away from ADMIN (to EDITOR **or** VIEWER).

---

### Task 1: Schema, migration, and role helpers

**Files:**
- Modify: `prisma/schema.prisma:20-23` (TeamRole enum)
- Create: `prisma/migrations/20260611000000_add_editor_team_role/migration.sql`
- Create: `src/lib/roles.ts`
- Create: `src/lib/roles.test.ts`
- Modify: `src/lib/db/connections.ts:16` (ConnectionRole type), `:35` (member role annotation)
- Modify: `src/lib/versions/permissions.ts`
- Modify: `src/lib/versions/permissions.test.ts`

- [ ] **Step 1: Add EDITOR to the Prisma enum**

In `prisma/schema.prisma`:

```prisma
enum TeamRole {
  ADMIN
  EDITOR
  VIEWER
}
```

- [ ] **Step 2: Create the migration file** (do NOT run `prisma migrate dev` — no dev DB guaranteed; create the file by hand following the existing `prisma/migrations/` convention)

`prisma/migrations/20260611000000_add_editor_team_role/migration.sql`:

```sql
-- AlterEnum
ALTER TYPE "TeamRole" ADD VALUE 'EDITOR';
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `pnpm prisma generate`
Expected: success; `src/generated/prisma/enums.ts` now contains `EDITOR` (gitignored — do not commit generated output).

- [ ] **Step 4: Write failing tests for the new roles module**

`src/lib/roles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canManageFiles, canManageConnections } from "./roles";

describe("canManageFiles", () => {
  it("allows ADMIN and EDITOR", () => {
    expect(canManageFiles("ADMIN")).toBe(true);
    expect(canManageFiles("EDITOR")).toBe(true);
  });

  it("denies VIEWER and null", () => {
    expect(canManageFiles("VIEWER")).toBe(false);
    expect(canManageFiles(null)).toBe(false);
  });
});

describe("canManageConnections", () => {
  it("allows only ADMIN", () => {
    expect(canManageConnections("ADMIN")).toBe(true);
    expect(canManageConnections("EDITOR")).toBe(false);
    expect(canManageConnections("VIEWER")).toBe(false);
    expect(canManageConnections(null)).toBe(false);
  });
});
```

- [ ] **Step 5: Run tests to verify they fail** — `pnpm vitest run src/lib/roles.test.ts` → FAIL (module not found)

- [ ] **Step 6: Implement `src/lib/roles.ts`**

```ts
export type Role = "ADMIN" | "EDITOR" | "VIEWER";

export const TEAM_ROLES: readonly Role[] = ["ADMIN", "EDITOR", "VIEWER"];

export function isTeamRole(value: unknown): value is Role {
  return TEAM_ROLES.includes(value as Role);
}

/** File-level write access: objects, folders, tags, version restore/undelete/copy, multipart abort. */
export function canManageFiles(role: Role | null | undefined): boolean {
  return role === "ADMIN" || role === "EDITOR";
}

/** Infrastructure access: connections, bucket create/delete, versioning config, purge. */
export function canManageConnections(role: Role | null | undefined): boolean {
  return role === "ADMIN";
}
```

- [ ] **Step 7: Run tests to verify they pass** — `pnpm vitest run src/lib/roles.test.ts` → PASS

- [ ] **Step 8: Re-point `ConnectionRole` at the shared type**

In `src/lib/db/connections.ts`:

```ts
import type { Role } from "@/lib/roles";

export type ConnectionRole = Role;
```

And in `getRoleForWorkspace`'s parameter type, change `team: { members: Array<{ role: "ADMIN" | "VIEWER" }> } | null` to `team: { members: Array<{ role: Role }> } | null`.

- [ ] **Step 9: Extend version-action tests with EDITOR cases**

Add to `src/lib/versions/permissions.test.ts` (keep existing tests untouched):

```ts
it("EDITOR can perform write-level actions but not admin-only actions", () => {
  expect(canPerformVersionAction("EDITOR", "list")).toBe(true);
  expect(canPerformVersionAction("EDITOR", "presign")).toBe(true);
  expect(canPerformVersionAction("EDITOR", "restore")).toBe(true);
  expect(canPerformVersionAction("EDITOR", "undelete")).toBe(true);
  expect(canPerformVersionAction("EDITOR", "copy")).toBe(true);
  expect(canPerformVersionAction("EDITOR", "purge")).toBe(false);
  expect(canPerformVersionAction("EDITOR", "bucket_toggle")).toBe(false);
});
```

- [ ] **Step 10: Run to verify failure** — `pnpm vitest run src/lib/versions/permissions.test.ts` → FAIL (EDITOR falls through to `return false`)

- [ ] **Step 11: Implement EDITOR handling in `src/lib/versions/permissions.ts`**

```ts
export function canPerformVersionAction(
  role: ConnectionRole | null,
  action: VersionAction,
): boolean {
  if (role === "ADMIN") return true;
  if (role === "EDITOR") return !ADMIN_ONLY.has(action);
  if (role === "VIEWER") {
    return !ADMIN_ONLY.has(action) && !WRITE_LEVEL.has(action);
  }
  return false;
}
```

- [ ] **Step 12: Run full test suite** — `pnpm test` → all pass

- [ ] **Step 13: Commit** — `git add -A && git commit -m "feat(roles): add EDITOR team role enum, migration, and role helpers"`

---

### Task 2: API route authorization

**Files (modify):**
- `src/app/api/objects/upload/route.ts:35`
- `src/app/api/objects/delete/route.ts:33`
- `src/app/api/objects/copy/route.ts:74`
- `src/app/api/objects/move/route.ts:76`
- `src/app/api/objects/rename/route.ts:44`
- `src/app/api/objects/folder/route.ts:31`
- `src/app/api/objects/tag/route.ts:38`
- `src/app/api/objects/versions/restore/route.ts:30`
- `src/app/api/objects/versions/undelete/route.ts:31`
- `src/app/api/objects/versions/copy/route.ts:56`
- `src/app/api/buckets/[bucket]/multipart-uploads/route.ts:100`
- `src/app/api/teams/[teamId]/members/route.ts`
- `src/app/api/teams/[teamId]/members/[memberId]/route.ts`

**Explicitly unchanged (ADMIN-only stays):** `src/app/api/buckets/route.ts` (create bucket), `src/app/api/buckets/[bucket]/route.ts` (delete bucket), `src/app/api/buckets/[bucket]/versioning/route.ts`, `src/app/api/objects/versions/purge/route.ts`, everything under `src/app/api/connections/**`, notes moderation in `src/app/api/notes/**` (`isAdmin` semantics unchanged).

- [ ] **Step 1: Switch object-write routes to `canManageFiles`**

In each of upload, delete, copy, move, rename, folder, tag, versions/restore, versions/undelete, versions/copy, multipart-uploads routes, add:

```ts
import { canManageFiles } from "@/lib/roles";
```

and replace the role guard. Single-access routes:

```ts
// before
if (access.role !== "ADMIN") {
// after
if (!canManageFiles(access.role)) {
```

`move/route.ts:76` and `versions/copy/route.ts:56` check two accesses:

```ts
// before
if (sourceAccess.role !== "ADMIN" || targetAccess.role !== "ADMIN") {
// after
if (!canManageFiles(sourceAccess.role) || !canManageFiles(targetAccess.role)) {
```

`copy/route.ts:74` guards `targetAccess`:

```ts
if (!canManageFiles(targetAccess.role)) {
```

Keep the surrounding 403 responses exactly as they are.

- [ ] **Step 2: Accept EDITOR in team member add (POST)**

In `src/app/api/teams/[teamId]/members/route.ts`, replace the role validation:

```ts
// before
if (role !== "ADMIN" && role !== "VIEWER") {
// after
import { isTeamRole } from "@/lib/roles";
...
if (!isTeamRole(role)) {
```

- [ ] **Step 3: Accept EDITOR in member role PATCH and fix last-admin rule**

In `src/app/api/teams/[teamId]/members/[memberId]/route.ts`:

```ts
// validation, before
if (!role || (role !== "ADMIN" && role !== "VIEWER")) {
// after
if (!role || !isTeamRole(role)) {
```

```ts
// last-admin guard, before
if (member.role === "ADMIN" && role === "VIEWER") {
// after — demotion to EDITOR must also be blocked when they're the last admin
if (member.role === "ADMIN" && role !== "ADMIN") {
```

DELETE handler's existing last-admin guard is already role-agnostic — leave it.

- [ ] **Step 4: Verify** — `pnpm test` passes, `pnpm lint` clean, `npx tsc --noEmit` clean (or `pnpm build` if tsc not directly runnable).

- [ ] **Step 5: Commit** — `git commit -am "feat(api): grant EDITOR file-level write access, keep infrastructure ADMIN-only"`

---

### Task 3: UI — role types, team management, and write gating

**Files (modify):**
- `src/lib/queries/teams.ts` (7 occurrences of `"ADMIN" | "VIEWER"`)
- `src/lib/queries/workspaces.ts:9`
- `src/lib/queries/connections.ts:15`
- `src/app/app/teams/page.tsx:79,99`
- `src/components/teams/team-members-card.tsx`
- `src/components/browser/file-browser.tsx:84`
- `src/components/buckets/bucket-detail-tabs.tsx:39`
- `src/components/buckets/overview-tab.tsx:19`

**Explicitly unchanged (ADMIN-only stays):** `bucket-list.tsx` (create/delete bucket gates), `app-sidebar.tsx`, `connection-list.tsx`, `connection-form.tsx`, `connection-identity-card.tsx`, `import-aws-profile-dialog.tsx`.

- [ ] **Step 1: Replace role literal unions with the shared type**

In `src/lib/queries/teams.ts`, `src/lib/queries/workspaces.ts`, `src/lib/queries/connections.ts`, `src/app/app/teams/page.tsx`: add `import type { Role } from "@/lib/roles";` and replace every `"ADMIN" | "VIEWER"` type annotation with `Role`.

- [ ] **Step 2: Team members card — add Editor everywhere roles appear**

In `src/components/teams/team-members-card.tsx`:

Props and state:

```ts
import type { Role } from "@/lib/roles";
import { Loader2, MoreVertical, Pencil, Plus, Shield, User } from "lucide-react";

onAddMember: (data: { email: string; role: Role }) => Promise<void>;
onUpdateRole: (memberId: string, role: Role) => Promise<void>;
...
const [role, setRole] = useState<Role>("VIEWER");
...
onChange={(e) => setRole(e.target.value as Role)}
```

Add-member select gains an option (between Viewer and Admin):

```tsx
<option value="VIEWER">Viewer</option>
<option value="EDITOR">Editor</option>
<option value="ADMIN">Admin</option>
```

Role badge icon — replace the `isAdmin` ternary at line ~102/113 with:

```tsx
const roleIcon =
  member.role === "ADMIN" ? (
    <Shield className="h-3 w-3" />
  ) : member.role === "EDITOR" ? (
    <Pencil className="h-3 w-3" />
  ) : (
    <User className="h-3 w-3" />
  );
```

and render `{roleIcon}` in the badge span (delete the now-unused `isAdmin` const).

Dropdown gains a "Make Editor" item between Make Admin and Make Viewer:

```tsx
<DropdownMenuItem
  onClick={() => onUpdateRole(member.id, "EDITOR")}
  disabled={member.role === "EDITOR" || isUpdating}
>
  Make Editor
</DropdownMenuItem>
```

- [ ] **Step 3: Gate file/upload UI with `canManageFiles`**

`src/components/browser/file-browser.tsx:84`:

```ts
import { canManageFiles } from "@/lib/roles";
const canWrite = connection ? canManageFiles(connection.role) : true;
```

`src/components/buckets/bucket-detail-tabs.tsx:39`:

```ts
const canAbort = canManageFiles(connection?.role ?? null);
```

`src/components/buckets/overview-tab.tsx:19` (overview tab gates file-content-level editing, not bucket config):

```ts
const canEdit = canManageFiles(connection?.role ?? null);
```

**Caveat for the implementer:** read `overview-tab.tsx` first; if `canEdit` actually gates bucket-infrastructure actions (e.g. versioning toggle, bucket deletion), leave it as `=== "ADMIN"` and report this in your summary instead.

- [ ] **Step 4: Verify** — `pnpm test`, `pnpm lint`, and `pnpm build` all pass.

- [ ] **Step 5: Commit** — `git commit -am "feat(ui): surface EDITOR role in team management and file write gating"`

---

### Task 4: Final verification

- [ ] `pnpm test` — all pass
- [ ] `pnpm lint` — clean
- [ ] `pnpm build` — succeeds
- [ ] Grep check: `rg 'role !== "ADMIN"|role === "ADMIN"' src/` — every remaining occurrence must be an intentionally ADMIN-only gate per the permission matrix above (connections, bucket create/delete, versioning, purge, team management, notes moderation, sidebar/connection UI).
- [ ] Commit any stragglers, push branch, open PR to `main`.
