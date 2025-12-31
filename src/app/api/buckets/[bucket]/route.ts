import { NextRequest, NextResponse } from "next/server";
import { DeleteBucketCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import type { S3Connection } from "@/types";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ bucket: string }> }
) {
  try {
    const { bucket } = await params;
    const { connection }: { connection: S3Connection } = await request.json();

    if (!connection || !bucket) {
      return NextResponse.json(
        { error: "Connection and bucket name are required" },
        { status: 400 }
      );
    }

    const client = createS3Client(connection);
    const command = new DeleteBucketCommand({ Bucket: bucket });
    await client.send(command);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
