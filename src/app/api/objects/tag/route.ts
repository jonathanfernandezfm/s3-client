import { NextResponse } from "next/server";
import { PutObjectTaggingCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { recordActivity } from "@/lib/db/activity";

interface TagRequest {
  connectionId: string;
  bucket: string;
  key: string;
  tags: Array<{ key: string; value: string }>;
}

export const POST = withAuth(async (req, { user }) => {
  try {
    const { connectionId, bucket, key, tags }: TagRequest = await req.json();

    if (!connectionId || !bucket || !key || !Array.isArray(tags)) {
      return NextResponse.json(
        { error: "connectionId, bucket, key, and tags are required" },
        { status: 400 }
      );
    }

    if (key.endsWith("/")) {
      return NextResponse.json(
        { error: "Folder tagging is not supported in bulk operations" },
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
      new PutObjectTaggingCommand({
        Bucket: bucket,
        Key: key,
        Tagging: { TagSet: tags.map((t) => ({ Key: t.key, Value: t.value })) },
      })
    );

    await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "TAG_CHANGE",
      bucket,
      key,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
