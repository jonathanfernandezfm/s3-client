import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { recordActivity } from "@/lib/db/activity";

interface UndeleteBody {
  connectionId: string;
  bucket: string;
  key: string;
  deleteMarkerVersionId: string;
}

export const POST = withAuth(async (req, { user }) => {
  try {
    const { connectionId, bucket, key, deleteMarkerVersionId }: UndeleteBody =
      await req.json();

    if (!connectionId || !bucket || !key || !deleteMarkerVersionId) {
      return NextResponse.json(
        { error: "connectionId, bucket, key, and deleteMarkerVersionId are required" },
        { status: 400 },
      );
    }

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (access.role !== "ADMIN") {
      return NextResponse.json(
        { error: "You do not have permission to undelete versions" },
        { status: 403 },
      );
    }

    const client = createS3Client(access.connection);
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
        VersionId: deleteMarkerVersionId,
      }),
    );

    await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName:
        [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "VERSION_UNDELETE",
      bucket,
      key,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
