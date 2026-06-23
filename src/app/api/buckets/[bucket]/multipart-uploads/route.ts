import { NextResponse } from "next/server";
import {
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
  type ListMultipartUploadsCommandOutput,
} from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { recordActivityBatch } from "@/lib/db/activity";
import { withAuth } from "@/lib/auth";
import { canManageFiles } from "@/lib/roles";
import type { IncompleteUpload } from "@/types/s3";

type RouteContext = { params: Promise<{ bucket: string }> };

export const POST = withAuth<RouteContext>(async (req, { user, params }) => {
  try {
    const { bucket } = await params;
    const { connectionId }: { connectionId: string } = await req.json();

    if (!connectionId || !bucket) {
      return NextResponse.json(
        { error: "connectionId and bucket name are required" },
        { status: 400 }
      );
    }

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const client = createS3Client(access.connection);

    const uploads: IncompleteUpload[] = [];
    let keyMarker: string | undefined = undefined;
    let uploadIdMarker: string | undefined = undefined;

    for (;;) {
      const response: ListMultipartUploadsCommandOutput = await client.send(
        new ListMultipartUploadsCommand({
          Bucket: bucket,
          KeyMarker: keyMarker,
          UploadIdMarker: uploadIdMarker,
        })
      );

      for (const u of response.Uploads ?? []) {
        if (!u.Key || !u.UploadId || !u.Initiated) continue;
        uploads.push({
          key: u.Key,
          uploadId: u.UploadId,
          initiated: u.Initiated.toISOString(),
          storageClass: u.StorageClass ?? null,
          initiatorDisplayName: u.Initiator?.DisplayName ?? null,
          initiatorId: u.Initiator?.ID ?? null,
        });
      }

      if (!response.IsTruncated) break;
      keyMarker = response.NextKeyMarker ?? undefined;
      uploadIdMarker = response.NextUploadIdMarker ?? undefined;
    }

    return NextResponse.json(uploads);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

type AbortRequest = {
  connectionId: string;
  uploads: Array<{ key: string; uploadId: string }>;
};

type AbortResult = {
  key: string;
  uploadId: string;
  success: boolean;
  error?: string;
};

export const DELETE = withAuth<RouteContext>(async (req, { user, params }) => {
  try {
    const { bucket } = await params;
    const body: AbortRequest = await req.json();
    const { connectionId, uploads } = body;

    if (!connectionId || !bucket || !Array.isArray(uploads) || uploads.length === 0) {
      return NextResponse.json(
        { error: "connectionId, bucket, and a non-empty uploads array are required" },
        { status: 400 }
      );
    }

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (!canManageFiles(access.role)) {
      return NextResponse.json(
        { error: "You do not have permission to abort uploads for this connection" },
        { status: 403 }
      );
    }

    const client = createS3Client(access.connection);

    const results: AbortResult[] = [];
    for (const u of uploads) {
      try {
        await client.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: u.key,
            UploadId: u.uploadId,
          })
        );
        results.push({ key: u.key, uploadId: u.uploadId, success: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        // Treat NoSuchUpload as success — the upload no longer exists, which matches the user's intent.
        if (message.includes("NoSuchUpload")) {
          results.push({ key: u.key, uploadId: u.uploadId, success: true });
        } else {
          results.push({ key: u.key, uploadId: u.uploadId, success: false, error: message });
        }
      }
    }

    const successfulItems = results
      .filter((r) => r.success)
      .map((r) => ({ key: r.key }));

    if (successfulItems.length > 0) {
      const activityResult = await recordActivityBatch({
        connectionId,
        userId: user.id,
        userDisplayName:
          [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        userImageUrl: user.imageUrl ?? null,
        action: "MULTIPART_ABORT",
        bucket,
        items: successfulItems,
      });
      if (!activityResult.ok) {
        console.error("[activity] multipart-abort-route lost audit row", { connectionId, bucket, reason: activityResult.reason });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
