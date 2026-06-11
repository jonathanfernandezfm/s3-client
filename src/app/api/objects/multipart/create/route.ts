import { NextResponse } from "next/server";
import {
  CreateMultipartUploadCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { canUploadFileSize } from "@/lib/subscriptions";
import { computePartSize, isSinglePutEligible } from "@/lib/uploads/part-math";

const PRESIGN_EXPIRES_SECONDS = 3600;

type CreateRequest = {
  connectionId: string;
  bucket: string;
  key: string;
  fileSize: number;
  contentType?: string;
};

export const POST = withAuth(async (req, { user }) => {
  try {
    const { connectionId, bucket, key, fileSize, contentType }: CreateRequest =
      await req.json();

    if (
      !connectionId ||
      !bucket ||
      !key ||
      typeof fileSize !== "number" ||
      !Number.isFinite(fileSize) ||
      fileSize < 0
    ) {
      return NextResponse.json(
        { error: "connectionId, bucket, key, and fileSize are required" },
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

    const tier = user.subscription?.tier ?? "FREE";
    const sizeCheck = canUploadFileSize(fileSize, tier);
    if (!sizeCheck.allowed) {
      return NextResponse.json({ error: sizeCheck.reason }, { status: 403 });
    }

    const client = createS3Client(access.connection);
    const resolvedContentType = contentType || "application/octet-stream";

    if (isSinglePutEligible(fileSize)) {
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: resolvedContentType,
        }),
        { expiresIn: PRESIGN_EXPIRES_SECONDS }
      );
      return NextResponse.json({ mode: "single", url });
    }

    const created = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: resolvedContentType,
      })
    );

    if (!created.UploadId) {
      return NextResponse.json(
        { error: "S3 did not return an upload ID" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      mode: "multipart",
      uploadId: created.UploadId,
      partSize: computePartSize(fileSize),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
