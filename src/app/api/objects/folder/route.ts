import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";

export const POST = withAuth(async (req, { user }) => {
  try {
    const {
      connectionId,
      bucket,
      path,
    }: { connectionId: string; bucket: string; path: string } = await req.json();

    if (!connectionId || !bucket || !path) {
      return NextResponse.json(
        { error: "connectionId, bucket, and path are required" },
        { status: 400 }
      );
    }

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }
    if (access.role !== "ADMIN") {
      return NextResponse.json(
        { error: "You do not have permission to modify objects for this connection" },
        { status: 403 }
      );
    }

    const client = createS3Client(access.connection);
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
});
