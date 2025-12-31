import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createS3Client } from "@/lib/s3/client";
import type { S3Connection } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const {
      connection,
      bucket,
      key,
    }: { connection: S3Connection; bucket: string; key: string } =
      await request.json();

    if (!connection || !bucket || !key) {
      return NextResponse.json(
        { error: "Connection, bucket, and key are required" },
        { status: 400 }
      );
    }

    const client = createS3Client(connection);
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const url = await getSignedUrl(client, command, { expiresIn: 3600 });

    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
