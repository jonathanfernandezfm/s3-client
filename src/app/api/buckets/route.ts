import { NextResponse } from "next/server";
import {
  ListBucketsCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { recordActivity } from "@/lib/db/activity";

// POST /api/buckets - List buckets for a connection
export const POST = withAuth(async (req, { user }) => {
  try {
    const { connectionId }: { connectionId: string } = await req.json();

    if (!connectionId) {
      return NextResponse.json(
        { error: "No connectionId provided" },
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

    const client = createS3Client(access.connection);
    const command = new ListBucketsCommand({});
    const response = await client.send(command);

    const buckets = (response.Buckets || []).map((bucket) => ({
      name: bucket.Name || "",
      creationDate: bucket.CreationDate,
    }));

    return NextResponse.json(buckets);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

// PUT /api/buckets - Create a new bucket
export const PUT = withAuth(async (req, { user }) => {
  try {
    const { connectionId, name }: { connectionId: string; name: string } =
      await req.json();

    if (!connectionId || !name) {
      return NextResponse.json(
        { error: "connectionId and bucket name are required" },
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
        { error: "You do not have permission to create buckets for this connection" },
        { status: 403 }
      );
    }

    const client = createS3Client(access.connection);
    const command = new CreateBucketCommand({ Bucket: name });
    await client.send(command);

    await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "BUCKET_CREATE",
      bucket: name,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
