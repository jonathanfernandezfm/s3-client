import { NextResponse } from "next/server";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { withAuth } from "@/lib/auth";
import { requireConnectionAccess } from "@/lib/auth/require-connection-access";
import { meterOperation } from "@/lib/subscriptions";
import { recordActivityBatch } from "@/lib/db/activity";
import prisma from "@/lib/db/prisma";
import { indexBulkDelete } from "@/lib/search/index-ops";
import { DeleteObjectsRequest } from "@/lib/schemas/objects";

export const POST = withAuth(async (req, { user }) => {
  const parsed = DeleteObjectsRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }
  const { connectionId, bucket, keys } = parsed.data;

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
    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
        Quiet: true,
      },
    });

    await client.send(command);

    const activityResult = await recordActivityBatch({
      connectionId,
      userId: user.id,
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "DELETE",
      bucket,
      items: keys.map((k) => ({ key: k })),
    });
    if (!activityResult.ok) {
      console.error("[activity] delete-route lost audit row", { connectionId, keys: keys.length, reason: activityResult.reason });
    }

    await indexBulkDelete({ connectionId, bucket, keys });

    try {
      await prisma.fileNote.deleteMany({
        where: { connectionId, bucket, key: { in: keys } },
      });
    } catch (err) {
      console.error("[notes] cascade delete failed:", err);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
