import { NextResponse } from "next/server";
import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { buildCopySource } from "@/lib/s3/copy-source";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { canManageFiles } from "@/lib/roles";
import { recordActivity } from "@/lib/db/activity";

interface CopyVersionBody {
  connectionId: string;
  bucket: string;
  key: string;
  versionId: string;
  targetConnectionId: string;
  targetBucket: string;
  targetKey: string;
}

export const POST = withAuth(async (req, { user }) => {
  try {
    const {
      connectionId,
      bucket,
      key,
      versionId,
      targetConnectionId,
      targetBucket,
      targetKey,
    }: CopyVersionBody = await req.json();

    if (
      !connectionId ||
      !bucket ||
      !key ||
      !versionId ||
      !targetConnectionId ||
      !targetBucket ||
      !targetKey
    ) {
      return NextResponse.json(
        {
          error:
            "connectionId, bucket, key, versionId, targetConnectionId, targetBucket, targetKey are required",
        },
        { status: 400 },
      );
    }

    const sourceAccess = await getConnectionAccessById(connectionId, user.id);
    if (!sourceAccess) {
      return NextResponse.json({ error: "Source connection not found" }, { status: 404 });
    }
    const targetAccess = await getConnectionAccessById(targetConnectionId, user.id);
    if (!targetAccess) {
      return NextResponse.json({ error: "Target connection not found" }, { status: 404 });
    }
    if (!canManageFiles(sourceAccess.role) || !canManageFiles(targetAccess.role)) {
      return NextResponse.json(
        { error: "You do not have permission to copy versions" },
        { status: 403 },
      );
    }

    if (connectionId !== targetConnectionId) {
      return NextResponse.json(
        { error: "Cross-connection version copy is not supported in v1" },
        { status: 400 },
      );
    }

    const client = createS3Client(sourceAccess.connection);
    await client.send(
      new CopyObjectCommand({
        Bucket: targetBucket,
        Key: targetKey,
        CopySource: buildCopySource(bucket, key, versionId),
      }),
    );

    await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName:
        [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "COPY",
      bucket: targetBucket,
      key: targetKey,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
