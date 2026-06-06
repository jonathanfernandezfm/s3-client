import { NextResponse } from "next/server";
import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import {
  emptyAccumulator,
  accumulateObjectStats,
  summarizeStorageClasses,
} from "@/lib/buckets/stats-helpers";

type RouteContext = { params: Promise<{ bucket: string }> };

export const POST = withAuth<RouteContext>(async (req, { user, params }) => {
  try {
    const { bucket } = await params;
    const { connectionId }: { connectionId: string } = await req.json();

    if (!connectionId || !bucket) {
      return NextResponse.json(
        { error: "connectionId and bucket are required" },
        { status: 400 },
      );
    }

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const client = createS3Client(access.connection);

    let acc = emptyAccumulator();
    let continuationToken: string | undefined = undefined;

    for (;;) {
      const response: ListObjectsV2CommandOutput = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        }),
      );
      acc = accumulateObjectStats(acc, response.Contents ?? []);
      if (!response.IsTruncated) break;
      continuationToken = response.NextContinuationToken ?? undefined;
    }

    return NextResponse.json({
      objectCount: acc.count,
      totalSize: acc.size,
      storageClasses: summarizeStorageClasses(acc.byClass),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
