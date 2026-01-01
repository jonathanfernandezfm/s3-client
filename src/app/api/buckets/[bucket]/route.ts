import { NextRequest, NextResponse } from "next/server";
import { DeleteBucketCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionById } from "@/lib/db/connections";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ bucket: string }> }
) {
  try {
    const { bucket } = await params;
    const { connectionId }: { connectionId: string } = await request.json();

    if (!connectionId || !bucket) {
      return NextResponse.json(
        { error: "connectionId and bucket name are required" },
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
    const command = new DeleteBucketCommand({ Bucket: bucket });
    await client.send(command);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
