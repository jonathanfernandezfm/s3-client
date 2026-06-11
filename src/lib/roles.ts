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
