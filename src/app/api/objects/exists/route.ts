import { NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";

const MAX_KEYS = 1000;
const CHUNK_SIZE = 8;

export const POST = withAuth(async (req, { user }) => {
  try {
    const body: unknown = await req.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("connectionId" in body) ||
      !("bucket" in body) ||
      !("keys" in body)
    ) {
      return NextResponse.json(
        { error: "connectionId, bucket, and keys are required" },
        { status: 400 }
      );
    }

    const { connectionId, bucket, keys } = body as {
      connectionId: unknown;
      bucket: unknown;
      keys: unknown;
    };

    if (
      typeof connectionId !== "string" ||
      !connectionId ||
      typeof bucket !== "string" ||
      !bucket ||
      !Array.isArray(keys) ||
      keys.length === 0
    ) {
      return NextResponse.json(
        { error: "connectionId, bucket, and keys are required" },
        { status: 400 }
      );
    }

    if (keys.length > MAX_KEYS) {
      return NextResponse.json(
        { error: `keys array exceeds the maximum of ${MAX_KEYS} entries` },
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
    const existing: string[] = [];

    // Process in chunks of CHUNK_SIZE to bound concurrency.
    for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
      const chunk = keys.slice(i, i + CHUNK_SIZE) as string[];
      const results = await Promise.all(
        chunk.map(async (key) => {
          try {
            await client.send(
              new HeadObjectCommand({ Bucket: bucket, Key: key })
            );
            return key; // exists
          } catch (err) {
            const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
            const name = e?.name ?? "";
            const code = e?.Code ?? "";
            const status = e?.$metadata?.httpStatusCode;
            const isNotFound =
              name === "NotFound" ||
              name === "NoSuchKey" ||
              code === "NotFound" ||
              code === "NoSuchKey" ||
              status === 404;
            if (isNotFound) return null; // does not exist
            // Real error — propagate so the caller doesn't silently skip conflict check.
            throw err;
          }
        })
      );
      for (const r of results) {
        if (r !== null) existing.push(r);
      }
    }

    return NextResponse.json({ existing });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
