import { NextRequest, NextResponse } from "next/server";
import {
  ListBucketsCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import type { S3Connection } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const { connection }: { connection: S3Connection } = await request.json();

    if (!connection) {
      return NextResponse.json(
        { error: "No connection provided" },
        { status: 400 }
      );
    }

    const client = createS3Client(connection);
    const command = new ListBucketsCommand({});
    const response = await client.send(command);

    const buckets = (response.Buckets || []).map((bucket) => ({
      name: bucket.Name || "",
      creationDate: bucket.CreationDate,
    }));

    return NextResponse.json(buckets);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { connection, name }: { connection: S3Connection; name: string } =
      await request.json();

    if (!connection || !name) {
      return NextResponse.json(
        { error: "Connection and bucket name are required" },
        { status: 400 }
      );
    }

    const client = createS3Client(connection);
    const command = new CreateBucketCommand({ Bucket: name });
    await client.send(command);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
