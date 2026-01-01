import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionById } from "@/lib/db/connections";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const bucket = formData.get("bucket") as string;
    const key = formData.get("key") as string;
    const connectionId = formData.get("connectionId") as string;

    if (!file || !bucket || !key || !connectionId) {
      return NextResponse.json(
        { error: "Missing required fields" },
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

    const arrayBuffer = await file.arrayBuffer();
    const body = Buffer.from(arrayBuffer);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: file.type || "application/octet-stream",
    });

    await client.send(command);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
