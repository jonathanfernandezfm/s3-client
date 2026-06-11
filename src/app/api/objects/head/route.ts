import { NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import type { ObjectProperties } from "@/types";

export const POST = withAuth(async (req, { user }) => {
  try {
    const {
      connectionId,
      bucket,
      key,
    }: { connectionId: string; bucket: string; key: string } = await req.json();

    if (!connectionId || !bucket || !key) {
      return NextResponse.json(
        { error: "connectionId, bucket, and key are required" },
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

    const client = createS3Client(access.connection);
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );

    const properties: ObjectProperties = {
      contentType: head.ContentType,
      cacheControl: head.CacheControl,
      contentDisposition: head.ContentDisposition,
      contentEncoding: head.ContentEncoding,
      contentLanguage: head.ContentLanguage,
      metadata: head.Metadata ?? {},
      storageClass: head.StorageClass ?? "STANDARD",
      serverSideEncryption: head.ServerSideEncryption,
      sseKmsKeyId: head.SSEKMSKeyId,
      size: head.ContentLength,
      etag: head.ETag,
      lastModified: head.LastModified?.toISOString(),
      versionId: head.VersionId,
      restore: head.Restore,
    };

    return NextResponse.json(properties);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
