import { NextRequest, NextResponse } from "next/server";
import { ListBucketsCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionById } from "@/lib/db/connections";

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

export async function POST(request: NextRequest) {
  try {
    const body: TestConnectionRequest = await request.json();

    let connectionConfig: {
      endpoint: string;
      accessKeyId: string;
      secretAccessKey: string;
      region: string;
      forcePathStyle: boolean;
    };

    // If an ID is provided, fetch the connection from the database
    if (body.id) {
      const dbConnection = await getConnectionById(body.id);
      if (!dbConnection) {
        return NextResponse.json(
          { success: false, error: "Connection not found" },
          { status: 404 }
        );
      }
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
}
