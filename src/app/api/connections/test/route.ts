import { NextResponse } from "next/server";
import { ListBucketsCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";

interface TestConnectionRequest {
  // For existing connections - just pass the ID
  id?: string;
  // For new connections or when credentials are provided directly
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  forcePathStyle?: boolean;
}

export const POST = withAuth(async (req, { user }) => {
  try {
    const body: TestConnectionRequest = await req.json();

    let connectionConfig: {
      endpoint: string;
      accessKeyId: string;
      secretAccessKey: string;
      region: string;
      forcePathStyle: boolean;
    };

    // If an ID is provided, fetch the connection from the database
    if (body.id) {
      const access = await getConnectionAccessById(body.id, user.id);
      if (!access) {
        return NextResponse.json(
          { success: false, error: "Connection not found" },
          { status: 404 }
        );
      }
      if (access.role !== "ADMIN") {
        return NextResponse.json(
          { success: false, error: "Insufficient permissions to test this connection" },
          { status: 403 }
        );
      }
      const dbConnection = access.connection;
      connectionConfig = {
        endpoint: dbConnection.endpoint,
        accessKeyId: dbConnection.accessKeyId,
        secretAccessKey: dbConnection.secretAccessKey,
        region: dbConnection.region,
        forcePathStyle: dbConnection.forcePathStyle,
      };
    } else {
      // Use credentials from the request (for new connections being configured)
      if (!body.endpoint || !body.accessKeyId || !body.secretAccessKey) {
        return NextResponse.json(
          { success: false, error: "Missing required connection parameters" },
          { status: 400 }
        );
      }
      connectionConfig = {
        endpoint: body.endpoint,
        accessKeyId: body.accessKeyId,
        secretAccessKey: body.secretAccessKey,
        region: body.region || "us-east-1",
        forcePathStyle: body.forcePathStyle ?? true,
      };
    }

    const client = createS3Client(connectionConfig);
    const command = new ListBucketsCommand({});

    await client.send(command);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
