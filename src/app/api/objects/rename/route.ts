import { NextResponse } from "next/server";
import { CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { recordActivity } from "@/lib/db/activity";

interface RenameRequest {
  connectionId: string;
  bucket: string;
  sourceKey: string;
  targetKey: string;
}

export const POST = withAuth(async (req, { user }) => {
  try {
    const { connectionId, bucket, sourceKey, targetKey }: RenameRequest =
      await req.json();

    if (!connectionId || !bucket || !sourceKey || !targetKey) {
      return NextResponse.json(
        { error: "connectionId, bucket, sourceKey, and targetKey are required" },
        { status: 400 }
      );
    }

    if (sourceKey === targetKey) {
      return NextResponse.json({ success: true, skipped: true });
    }

    if (sourceKey.endsWith("/")) {
      return NextResponse.json(
        { error: "Folder rename is not supported in bulk operations" },
        { status: 400 }
      );
    }

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (access.role !== "ADMIN") {
      return NextResponse.json(
        { error: "You do not have permission to modify objects for this connection" },
        { status: 403 }
      );
    }

    const client = createS3Client(access.connection);

    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: targetKey,
        CopySource: encodeURIComponent(`${bucket}/${sourceKey}`),
      })
    );
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: sourceKey })
    );

    await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "RENAME",
      bucket,
      key: sourceKey,
      targetKey,
    });

    return NextResponse.json({ success: true, targetKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
