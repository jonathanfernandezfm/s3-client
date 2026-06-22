import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { canManageFiles } from "@/lib/roles";
import { meterOperation } from "@/lib/subscriptions";
import { recordActivity } from "@/lib/db/activity";
import { indexUpsert } from "@/lib/search/index-ops";

export const POST = withAuth(async (req, { user }) => {
  try {
    const {
      connectionId,
      bucket,
      path,
    }: { connectionId: string; bucket: string; path: string } = await req.json();

    if (!connectionId || !bucket || !path) {
      return NextResponse.json(
        { error: "connectionId, bucket, and path are required" },
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
    if (!canManageFiles(access.role)) {
      return NextResponse.json(
        { error: "You do not have permission to modify objects for this connection" },
        { status: 403 }
      );
    }

    const tier = user.subscription?.tier ?? "FREE";
    const meter = await meterOperation(user.id, tier);
    if (!meter.allowed) {
      return NextResponse.json({ error: meter.reason }, { status: 403 });
    }

    const client = createS3Client(access.connection);
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: path.endsWith("/") ? path : path + "/",
      Body: "",
    });

    await client.send(command);

    const folderKey = path.endsWith("/") ? path : path + "/";
    const activityResult = await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "FOLDER_CREATE",
      bucket,
      key: folderKey,
    });
    if (!activityResult.ok) {
      console.error("[activity] folder-route lost audit row", { connectionId, bucket, key: folderKey, reason: activityResult.reason });
    }

    await indexUpsert({
      workspaceId: access.workspaceId,
      connectionId,
      bucket,
      key: folderKey,
      size: 0n,
      lastModified: new Date(),
      etag: null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
