import { NextResponse } from "next/server";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { canManageFiles } from "@/lib/roles";
import { recordActivityBatch } from "@/lib/db/activity";
import prisma from "@/lib/db/prisma";
import { indexBulkDelete } from "@/lib/search/index-ops";

export const POST = withAuth(async (req, { user }) => {
  try {
    const {
      connectionId,
      bucket,
      keys,
    }: { connectionId: string; bucket: string; keys: string[] } =
      await req.json();

    if (!connectionId || !bucket || !keys || keys.length === 0) {
      return NextResponse.json(
        { error: "connectionId, bucket, and keys are required" },
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

    const client = createS3Client(access.connection);
    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
        Quiet: true,
      },
    });

    await client.send(command);

    await recordActivityBatch({
      connectionId,
      userId: user.id,
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "DELETE",
      bucket,
      items: keys.map((k) => ({ key: k })),
    });

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
