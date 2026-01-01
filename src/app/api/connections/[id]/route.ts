import { NextRequest, NextResponse } from "next/server";
import {
  getConnectionById,
  updateConnection,
  deleteConnection,
  type ConnectionUpdate,
} from "@/lib/db/connections";

// GET /api/connections/[id] - Get a single connection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const connection = await getConnectionById(id);

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
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
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/connections/[id] - Update a connection
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: ConnectionUpdate = await request.json();

    const existingConnection = await getConnectionById(id);
    if (!existingConnection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    const connection = await updateConnection(id, body);

    return NextResponse.json({
      id: connection.id,
      name: connection.name,
      endpoint: connection.endpoint,
      region: connection.region,
      accessKeyId: connection.accessKeyId,
      forcePathStyle: connection.forcePathStyle,
      updatedAt: connection.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/connections/[id] - Delete a connection
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existingConnection = await getConnectionById(id);
    if (!existingConnection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    await deleteConnection(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
