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
