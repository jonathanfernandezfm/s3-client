import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import type { S3Connection } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const {
      connection,
      bucket,
      keys,
    }: { connection: S3Connection; bucket: string; keys: string[] } =
      await request.json();

    if (!connection || !bucket || !keys || keys.length === 0) {
      return NextResponse.json(
        { error: "Connection, bucket, and keys are required" },
        { status: 400 }
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
