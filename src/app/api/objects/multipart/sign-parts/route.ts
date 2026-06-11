import { NextResponse } from "next/server";
import { UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { validatePartNumbers, MAX_SIGN_BATCH } from "@/lib/uploads/validate";

const PRESIGN_EXPIRES_SECONDS = 3600;

type SignPartsRequest = {
  connectionId: string;
  bucket: string;
  key: string;
  uploadId: string;
  partNumbers: number[];
};

export const POST = withAuth(async (req, { user }) => {
  try {
    const { connectionId, bucket, key, uploadId, partNumbers }: SignPartsRequest =
      await req.json();

    if (!connectionId || !bucket || !key || !uploadId) {
      return NextResponse.json(
        { error: "connectionId, bucket, key, and uploadId are required" },
        { status: 400 }
      );
    }

    const validParts = validatePartNumbers(partNumbers);
    if (!validParts) {
      return NextResponse.json(
        {
          error: `partNumbers must be a non-empty array of integers between 1 and 10000 (max ${MAX_SIGN_BATCH} per request)`,
        },
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

    const urls: Record<number, string> = {};
    await Promise.all(
      validParts.map(async (partNumber) => {
        urls[partNumber] = await getSignedUrl(
          client,
          new UploadPartCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
          }),
          { expiresIn: PRESIGN_EXPIRES_SECONDS }
        );
      })
    );

    return NextResponse.json({ urls });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
