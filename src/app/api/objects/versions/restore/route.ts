import { NextResponse } from "next/server";
import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { buildCopySource } from "@/lib/s3/copy-source";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { canManageFiles } from "@/lib/roles";
import { recordActivity } from "@/lib/db/activity";

interface RestoreBody {
  connectionId: string;
  bucket: string;
  key: string;
  versionId: string;
}

export const POST = withAuth(async (req, { user }) => {
  try {
    const { connectionId, bucket, key, versionId }: RestoreBody = await req.json();

    if (!connectionId || !bucket || !key || !versionId) {
      return NextResponse.json(
        { error: "connectionId, bucket, key, and versionId are required" },
        { status: 400 },
      );
    }

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (!canManageFiles(access.role)) {
      return NextResponse.json(
        { error: "You do not have permission to restore versions" },
        { status: 403 },
      );
    }

    const client = createS3Client(access.connection);
    const result = await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: key,
        CopySource: buildCopySource(bucket, key, versionId),
      }),
    );

    await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName:
        [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "VERSION_RESTORE",
      bucket,
      key,
    });

    return NextResponse.json({ success: true, newVersionId: result.VersionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
