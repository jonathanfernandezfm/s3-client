import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionById } from "@/lib/db/connections";

export async function POST(request: NextRequest) {
  try {
    const {
      connectionId,
      bucket,
      keys,
    }: { connectionId: string; bucket: string; keys: string[] } =
      await request.json();

    if (!connectionId || !bucket || !keys || keys.length === 0) {
      return NextResponse.json(
        { error: "connectionId, bucket, and keys are required" },
        { status: 400 }
      );
    }

    const connection = await getConnectionById(connectionId);
    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    const client = createS3Client(connection);
    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
        Quiet: true,
      },
    });

    await client.send(command);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
