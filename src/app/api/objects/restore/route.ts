import { NextResponse } from "next/server";
import { RestoreObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { canManageFiles } from "@/lib/roles";

interface RestoreRequestBody {
  connectionId: string;
  bucket: string;
  key: string;
  days?: number;
  tier?: "Standard" | "Bulk" | "Expedited";
}

export const POST = withAuth(async (req, { user }) => {
  try {
    const { connectionId, bucket, key, days, tier }: RestoreRequestBody =
      await req.json();

    if (!connectionId || !bucket || !key) {
      return NextResponse.json(
        { error: "connectionId, bucket, and key are required" },
        { status: 400 }
      );
    }
    if (key.endsWith("/")) {
      return NextResponse.json(
        { error: "Folders cannot be restored" },
        { status: 400 }
      );
    }

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (!canManageFiles(access.role)) {
      return NextResponse.json(
        { error: "You do not have permission to restore objects for this connection" },
        { status: 403 }
      );
    }

    const client = createS3Client(access.connection);
    try {
      await client.send(
        new RestoreObjectCommand({
          Bucket: bucket,
          Key: key,
          RestoreRequest: {
            Days: days && days > 0 ? days : 1,
            GlacierJobParameters: { Tier: tier ?? "Standard" },
          },
        })
      );
    } catch (err) {
      const name = (err as { name?: string })?.name ?? "";
      if (name === "RestoreAlreadyInProgress") {
        return NextResponse.json(
          {
            status: "in-progress",
            message: "A restore is already in progress for this object.",
          },
          { status: 200 }
        );
      }
      throw err;
    }

    return NextResponse.json({ status: "initiated" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
