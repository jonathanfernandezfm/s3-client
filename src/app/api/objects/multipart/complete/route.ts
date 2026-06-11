import { NextResponse } from "next/server";
import {
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { recordUpload } from "@/lib/subscriptions";
import { recordActivity } from "@/lib/db/activity";
import { indexUpsert } from "@/lib/search/index-ops";

type CompleteRequest = {
  connectionId: string;
  bucket: string;
  key: string;
  uploadId?: string;
  parts?: Array<{ partNumber: number; etag: string }>;
};

export const POST = withAuth(async (req, { user }) => {
  try {
    const { connectionId, bucket, key, uploadId, parts }: CompleteRequest =
      await req.json();

    if (!connectionId || !bucket || !key) {
      return NextResponse.json(
        { error: "connectionId, bucket, and key are required" },
        { status: 400 }
      );
    }
    if (
      uploadId &&
      (!Array.isArray(parts) ||
        parts.length === 0 ||
        parts.some(
          (p) =>
            !p ||
            typeof p.partNumber !== "number" ||
            !Number.isInteger(p.partNumber) ||
            typeof p.etag !== "string" ||
            p.etag.length === 0
        ))
    ) {
      return NextResponse.json(
        { error: "parts are required to complete a multipart upload" },
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
        { error: "You do not have permission to upload files for this connection" },
        { status: 403 }
      );
    }

    const client = createS3Client(access.connection);

    if (uploadId) {
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            // S3 requires ascending part order; don't rely on the caller.
            Parts: parts!
              .slice()
              .sort((a, b) => a.partNumber - b.partNumber)
              .map((p) => ({
                PartNumber: p.partNumber,
                ETag: p.etag,
              })),
          },
        })
      );
    }

    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );
    const size = BigInt(head.ContentLength ?? 0);

    await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName:
        [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "UPLOAD",
      bucket,
      key,
      byteSize: size,
    });

    await indexUpsert({
      workspaceId: access.workspaceId,
      connectionId,
      bucket,
      key,
      size,
      lastModified: head.LastModified ?? new Date(),
      etag: head.ETag ? head.ETag.replace(/"/g, "") : null,
    });

    await recordUpload(user.id, Number(size));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
