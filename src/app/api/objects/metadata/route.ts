import { NextResponse } from "next/server";
import { CopyObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { recordActivity } from "@/lib/db/activity";
import {
  buildMetadataCopyParams,
  MetadataEditError,
  type MetadataEdits,
} from "@/lib/s3/metadata";

interface UpdateMetadataRequest {
  connectionId: string;
  bucket: string;
  key: string;
  contentType: string;
  cacheControl: string;
  metadata: Record<string, string>;
  storageClass: string;
}

export const POST = withAuth(async (req, { user }) => {
  try {
    const {
      connectionId,
      bucket,
      key,
      contentType,
      cacheControl,
      metadata,
      storageClass,
    }: UpdateMetadataRequest = await req.json();

    if (
      !connectionId ||
      !bucket ||
      !key ||
      typeof metadata !== "object" ||
      metadata === null
    ) {
      return NextResponse.json(
        { error: "connectionId, bucket, key, and metadata are required" },
        { status: 400 }
      );
    }

    if (key.endsWith("/")) {
      return NextResponse.json(
        { error: "Folder metadata editing is not supported" },
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
        { error: "You do not have permission to modify objects for this connection" },
        { status: 403 }
      );
    }

    const client = createS3Client(access.connection);
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );

    const edits: MetadataEdits = {
      contentType: contentType ?? "",
      cacheControl: cacheControl ?? "",
      metadata,
      storageClass: storageClass ?? "",
    };

    let params;
    try {
      params = buildMetadataCopyParams(bucket, key, head, edits);
    } catch (err) {
      if (err instanceof MetadataEditError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    await client.send(new CopyObjectCommand(params));

    await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName:
        [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "METADATA_CHANGE",
      bucket,
      key,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
