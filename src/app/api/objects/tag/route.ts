import { NextResponse } from "next/server";
import { GetObjectTaggingCommand, PutObjectTaggingCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { recordActivity } from "@/lib/db/activity";
import { indexUpdateTags } from "@/lib/search/index-ops";

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

    const nextTags = tags.map((t) => t.value);
    await indexUpdateTags({ connectionId, bucket, key, tags: nextTags });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

export const GET = withAuth(async (req, { user }) => {
  const connectionId = req.nextUrl.searchParams.get("connectionId");
  const bucket = req.nextUrl.searchParams.get("bucket");
  const key = req.nextUrl.searchParams.get("key");

  if (!connectionId || !bucket || !key) {
    return NextResponse.json(
      { error: "connectionId, bucket, and key are required" },
      { status: 400 }
    );
  }

  if (key.endsWith("/")) {
    return NextResponse.json({ error: "Folders cannot be tagged" }, { status: 400 });
  }

  const access = await getConnectionAccessById(connectionId, user.id);
  if (!access) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  try {
    const client = createS3Client(access.connection);
    const result = await client.send(
      new GetObjectTaggingCommand({ Bucket: bucket, Key: key })
    );
    const tags = (result.TagSet ?? []).map((t) => ({
      key: t.Key ?? "",
      value: t.Value ?? "",
    }));
    return NextResponse.json({ tags });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
