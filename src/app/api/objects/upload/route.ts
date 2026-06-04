import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import {
  canUploadFileSize,
  recordUpload,
} from "@/lib/subscriptions";
import { recordActivity } from "@/lib/db/activity";

export const POST = withAuth(async (req, { user }) => {
  try {
    const formData = await req.formData();
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

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }
    if (access.role !== "ADMIN") {
      return NextResponse.json(
        { error: "You do not have permission to upload files for this connection" },
        { status: 403 }
      );
    }

    // Check tier limits
    const tier = user.subscription?.tier ?? "FREE";

    // Check file size limit
    const sizeCheck = canUploadFileSize(file.size, tier);
    if (!sizeCheck.allowed) {
      return NextResponse.json({ error: sizeCheck.reason }, { status: 403 });
    }

    const client = createS3Client(access.connection);

    const arrayBuffer = await file.arrayBuffer();
    const body = Buffer.from(arrayBuffer);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: file.type || "application/octet-stream",
    });

    await client.send(command);

    await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "UPLOAD",
      bucket,
      key,
      byteSize: BigInt(file.size),
    });

    // Record usage
    await recordUpload(user.id, file.size);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
