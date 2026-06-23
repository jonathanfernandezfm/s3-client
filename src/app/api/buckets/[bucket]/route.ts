import { NextResponse } from "next/server";
import { DeleteBucketCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { recordActivity } from "@/lib/db/activity";
import prisma from "@/lib/db/prisma";
import { indexDeleteBucket } from "@/lib/search/index-ops";

type RouteContext = { params: Promise<{ bucket: string }> };

export const DELETE = withAuth<RouteContext>(async (req, { user, params }) => {
  try {
    const { bucket } = params;
    const { connectionId }: { connectionId: string } = await req.json();

    if (!connectionId || !bucket) {
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
        { error: "You do not have permission to delete buckets for this connection" },
        { status: 403 }
      );
    }

    const client = createS3Client(access.connection);
    const command = new DeleteBucketCommand({ Bucket: bucket });
    await client.send(command);

    const activityResult = await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "BUCKET_DELETE",
      bucket,
    });
    if (!activityResult.ok) {
      console.error("[activity] buckets-delete-route lost audit row", { connectionId, bucket, reason: activityResult.reason });
    }

    await indexDeleteBucket({ connectionId, bucket });

    try {
      await prisma.fileNote.deleteMany({
        where: { connectionId, bucket },
      });
    } catch (err) {
      console.error("[notes] cascade bucket-delete failed:", err);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
