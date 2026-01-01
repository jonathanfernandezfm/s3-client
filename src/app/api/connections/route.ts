import { NextRequest, NextResponse } from "next/server";
import {
  getAllConnections,
  createConnection,
  type ConnectionInput,
} from "@/lib/db/connections";

// GET /api/connections - List all connections
export async function GET() {
  try {
    const connections = await getAllConnections();

    // Don't expose secret keys in the list response
    const safeConnections = connections.map((conn) => ({
      id: conn.id,
      name: conn.name,
      endpoint: conn.endpoint,
      region: conn.region,
      accessKeyId: conn.accessKeyId,
      forcePathStyle: conn.forcePathStyle,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
    }));

    return NextResponse.json(safeConnections);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/connections - Create a new connection
export async function POST(request: NextRequest) {
  try {
    const body: ConnectionInput = await request.json();

    if (!body.endpoint || !body.accessKeyId || !body.secretAccessKey) {
      return NextResponse.json(
        { error: "Missing required fields: endpoint, accessKeyId, secretAccessKey" },
        { status: 400 }
      );
    }

    const connection = await createConnection({
      name: body.name,
      endpoint: body.endpoint,
      region: body.region || "us-east-1",
      accessKeyId: body.accessKeyId,
      secretAccessKey: body.secretAccessKey,
      forcePathStyle: body.forcePathStyle ?? true,
    });

    return NextResponse.json({
      id: connection.id,
      name: connection.name,
      endpoint: connection.endpoint,
      region: connection.region,
      accessKeyId: connection.accessKeyId,
      forcePathStyle: connection.forcePathStyle,
      createdAt: connection.createdAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
