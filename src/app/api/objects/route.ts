import { NextRequest, NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import type { S3Connection, S3Object } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const {
      connection,
      bucket,
      prefix = "",
    }: { connection: S3Connection; bucket: string; prefix?: string } =
      await request.json();

    if (!connection || !bucket) {
      return NextResponse.json(
        { error: "Connection and bucket are required" },
        { status: 400 }
      );
    }

    const client = createS3Client(connection);
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      Delimiter: "/",
      MaxKeys: 1000,
    });

    const response = await client.send(command);

    const folders: S3Object[] = (response.CommonPrefixes || []).map((p) => ({
      key: p.Prefix || "",
      isFolder: true,
    }));

    const files: S3Object[] = (response.Contents || [])
      .filter((obj) => obj.Key !== prefix)
      .map((obj) => ({
        key: obj.Key || "",
        lastModified: obj.LastModified,
        size: obj.Size,
        etag: obj.ETag,
        storageClass: obj.StorageClass,
        isFolder: false,
      }));

    return NextResponse.json({
      objects: [...folders, ...files],
      isTruncated: response.IsTruncated || false,
      nextContinuationToken: response.NextContinuationToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
