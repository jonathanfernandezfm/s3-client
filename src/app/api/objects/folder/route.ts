import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionById } from "@/lib/db/connections";

export async function POST(request: NextRequest) {
  try {
    const {
      connectionId,
      bucket,
      path,
    }: { connectionId: string; bucket: string; path: string } =
      await request.json();

    if (!connectionId || !bucket || !path) {
      return NextResponse.json(
        { error: "connectionId, bucket, and path are required" },
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
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: path.endsWith("/") ? path : path + "/",
      Body: "",
    });

    await client.send(command);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
