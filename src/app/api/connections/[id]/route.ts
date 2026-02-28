import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import {
  getConnectionAccessById,
  updateConnection,
  deleteConnection,
  type ConnectionUpdate,
} from "@/lib/db/connections";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/connections/[id] - Get a single connection
export const GET = withAuth<RouteContext>(async (req, { user, params }) => {
  const { id } = params;
  const access = await getConnectionAccessById(id, user.id);
  const connection = access?.connection;

  if (!connection) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  if (access.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Insufficient permissions to view connection configuration" },
      { status: 403 }
    );
  }

  // Return connection with secret key for operations
  return NextResponse.json({
    id: connection.id,
    name: connection.name,
    endpoint: connection.endpoint,
    region: connection.region,
    accessKeyId: connection.accessKeyId,
    secretAccessKey: connection.secretAccessKey,
    forcePathStyle: connection.forcePathStyle,
    workspaceId: access.workspaceId,
    workspaceType: access.workspaceType,
    role: access.role,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  });
});

// PUT /api/connections/[id] - Update a connection
export const PUT = withAuth<RouteContext>(async (req, { user, params }) => {
  const { id } = params;
  const body: ConnectionUpdate = await req.json();

  const access = await getConnectionAccessById(id, user.id);
  if (!access) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  if (access.role !== "ADMIN") {
    return NextResponse.json(
      { error: "You do not have permission to update this connection" },
      { status: 403 }
    );
  }

  const connection = await updateConnection(id, user.id, body);

  if (!connection) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: connection.id,
    name: connection.name,
    endpoint: connection.endpoint,
    region: connection.region,
    accessKeyId: connection.accessKeyId,
    forcePathStyle: connection.forcePathStyle,
    workspaceId: access.workspaceId,
    workspaceType: access.workspaceType,
    role: access.role,
    updatedAt: connection.updatedAt,
  });
});

// DELETE /api/connections/[id] - Delete a connection
export const DELETE = withAuth<RouteContext>(async (req, { user, params }) => {
  const { id } = params;

  const access = await getConnectionAccessById(id, user.id);
  if (!access) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  if (access.role !== "ADMIN") {
    return NextResponse.json(
      { error: "You do not have permission to delete this connection" },
      { status: 403 }
    );
  }

  const connection = await deleteConnection(id, user.id);

  if (!connection) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
});
