import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";

interface PresignBody {
  connectionId: string;
  bucket: string;
  key: string;
  versionId: string;
  downloadFilename?: string;
}

export const POST = withAuth(async (req, { user }) => {
  try {
    const { connectionId, bucket, key, versionId, downloadFilename }: PresignBody =
      await req.json();

    if (!connectionId || !bucket || !key || !versionId) {
      return NextResponse.json(
        { error: "connectionId, bucket, key, and versionId are required" },
        { status: 400 },
      );
    }

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const client = createS3Client(access.connection);
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      VersionId: versionId,
      ResponseContentDisposition: downloadFilename
        ? `attachment; filename="${downloadFilename.replace(/"/g, "")}"`
        : undefined,
    });

    const url = await getSignedUrl(client, command, { expiresIn: 3600 });
    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
