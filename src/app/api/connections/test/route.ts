import { NextRequest, NextResponse } from "next/server";
import { ListBucketsCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import type { S3Connection } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const connection: S3Connection = await request.json();

    if (!connection.endpoint || !connection.accessKeyId || !connection.secretAccessKey) {
      return NextResponse.json(
        { success: false, error: "Missing required connection parameters" },
        { status: 400 }
      );
    }

    const client = createS3Client(connection);
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
