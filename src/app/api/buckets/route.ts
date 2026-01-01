import { NextRequest, NextResponse } from "next/server";
import {
  ListBucketsCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionById } from "@/lib/db/connections";

export async function POST(request: NextRequest) {
  try {
    const { connectionId }: { connectionId: string } = await request.json();

    if (!connectionId) {
      return NextResponse.json(
        { error: "No connectionId provided" },
        { status: 400 }
      );
    }

    const connection = await getConnectionById(connectionId);
    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
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
    const { connectionId, name }: { connectionId: string; name: string } =
      await request.json();

    if (!connectionId || !name) {
      return NextResponse.json(
        { error: "connectionId and bucket name are required" },
        { status: 400 }
      );
    }

    const connection = await getConnectionById(connectionId);
    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
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
