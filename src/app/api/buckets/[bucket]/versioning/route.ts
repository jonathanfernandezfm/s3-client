import { NextRequest, NextResponse } from "next/server";
import {
  GetBucketVersioningCommand,
  PutBucketVersioningCommand,
} from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { recordActivity } from "@/lib/db/activity";
import {
  enabledFlagToSdkStatus,
  statusToActivityAction,
  toBucketVersioningStatus,
} from "@/lib/buckets/versioning-helpers";

type RouteContext = { params: Promise<{ bucket: string }> };

export const GET = withAuth<RouteContext>(async (req: NextRequest, { user, params }) => {
  try {
    const { bucket } = params;
    const connectionId = new URL(req.url).searchParams.get("connectionId");
    if (!connectionId || !bucket) {
      return NextResponse.json(
        { error: "connectionId and bucket are required" },
        { status: 400 },
      );
    }

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const client = createS3Client(access.connection);
    const response = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }));
    return NextResponse.json(toBucketVersioningStatus(response));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

export const PUT = withAuth<RouteContext>(async (req, { user, params }) => {
  try {
    const { bucket } = params;
    const { connectionId, enabled }: { connectionId: string; enabled: boolean } =
      await req.json();

    if (!connectionId || !bucket || typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "connectionId, bucket, and enabled (boolean) are required" },
        { status: 400 },
      );
    }

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (access.role !== "ADMIN") {
      return NextResponse.json(
        { error: "You do not have permission to change bucket versioning" },
        { status: 403 },
      );
    }

    const sdkStatus = enabledFlagToSdkStatus(enabled);
    const client = createS3Client(access.connection);
    await client.send(
      new PutBucketVersioningCommand({
        Bucket: bucket,
        VersioningConfiguration: { Status: sdkStatus },
      }),
    );

    const activityResult = await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName:
        [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: statusToActivityAction(sdkStatus),
      bucket,
    });
    if (!activityResult.ok) {
      console.error("[activity] bucket-versioning-route lost audit row", { connectionId, bucket, reason: activityResult.reason });
    }

    return NextResponse.json({ success: true, status: sdkStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
