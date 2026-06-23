import { NextResponse } from "next/server";
import { CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { buildCopySource } from "@/lib/s3/copy-source";
import { withAuth } from "@/lib/auth";
import { requireConnectionAccess } from "@/lib/auth/require-connection-access";
import { meterOperation } from "@/lib/subscriptions";
import { recordActivity } from "@/lib/db/activity";
import prisma from "@/lib/db/prisma";
import { indexRename } from "@/lib/search/index-ops";
import { RenameObjectRequest } from "@/lib/schemas/objects";

export const POST = withAuth(async (req, { user }) => {
  const parsed = RenameObjectRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }
  const { connectionId, bucket, sourceKey, targetKey } = parsed.data;

  if (sourceKey === targetKey) {
    return NextResponse.json({ success: true, skipped: true });
  }

  if (sourceKey.endsWith("/")) {
    return NextResponse.json(
      { error: "Folder rename is not supported in bulk operations" },
      { status: 400 }
    );
  }

  const result = await requireConnectionAccess(connectionId, user.id, "write");
  if (result instanceof NextResponse) return result;
  const { access } = result;

  const tier = user.subscription?.tier ?? "FREE";
  const meter = await meterOperation(user.id, tier);
  if (!meter.allowed) {
    return NextResponse.json({ error: meter.reason }, { status: 403 });
  }

  try {
    const client = createS3Client(access.connection);

    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: targetKey,
        CopySource: buildCopySource(bucket, sourceKey),
      })
    );
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: sourceKey })
    );

    const activityResult = await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "RENAME",
      bucket,
      key: sourceKey,
      targetKey,
    });
    if (!activityResult.ok) {
      console.error("[activity] rename-route lost audit row", { connectionId, bucket, key: sourceKey, reason: activityResult.reason });
    }

    await indexRename({
      workspaceId: access.workspaceId,
      connectionId,
      bucket,
      fromKey: sourceKey,
      toKey: targetKey,
      size: 0n,
      lastModified: new Date(),
      etag: null,
    });

    try {
      await prisma.fileNote.updateMany({
        where: { connectionId, bucket, key: sourceKey },
        data: { key: targetKey },
      });
    } catch (err) {
      console.error("[notes] cascade rename failed:", err);
    }

    return NextResponse.json({ success: true, targetKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
