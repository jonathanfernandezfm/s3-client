import { NextResponse } from "next/server";
import { PassThrough, Readable } from "stream";
import { ZipArchive, Archiver, type ArchiverError } from "archiver";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import {
  collectZipEntries,
  ZipTooLargeError,
  type ZipEntry,
} from "@/lib/zip/collect-entries";
import { sanitizeZipFilename } from "@/lib/zip/zip-naming";

export const runtime = "nodejs";

const MAX_SELECTED_KEYS = 1000;

interface ZipDownloadPayload {
  connectionId: string;
  bucket: string;
  keys: string[];
  rootPrefix?: string;
  filename?: string;
}

export const POST = withAuth(async (req, { user }) => {
  let payload: ZipDownloadPayload;
  try {
    const form = await req.formData();
    payload = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { connectionId, bucket, keys, rootPrefix = "", filename } = payload;
  if (
    !connectionId ||
    !bucket ||
    !Array.isArray(keys) ||
    keys.length === 0 ||
    keys.some((k) => typeof k !== "string" || k.length === 0)
  ) {
    return NextResponse.json(
      { error: "connectionId, bucket, and a non-empty keys array are required" },
      { status: 400 }
    );
  }
  if (keys.length > MAX_SELECTED_KEYS) {
    return NextResponse.json(
      { error: `At most ${MAX_SELECTED_KEYS} items can be zipped at once` },
      { status: 400 }
    );
  }

  const access = await getConnectionAccessById(connectionId, user.id);
  if (!access) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const client = createS3Client(access.connection);

  let entries: ZipEntry[];
  try {
    entries = await collectZipEntries(client, bucket, keys, rootPrefix);
  } catch (error) {
    if (error instanceof ZipTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { error: "Nothing to download — the selection contains no files" },
      { status: 400 }
    );
  }

  const archive = new ZipArchive({ store: true });
  const passthrough = new PassThrough();
  archive.on("warning", (err: ArchiverError) => console.warn("[download-zip] warning:", err));
  archive.pipe(passthrough);
  archive.on("error", (err) => passthrough.destroy(err));

  void (async () => {
    for (const entry of entries) {
      const object = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: entry.key })
      );
      if (!object.Body) continue;
      await appendEntry(archive, object.Body as Readable, entry.name);
    }
    await archive.finalize();
  })().catch((error) => {
    console.error("[download-zip] aborted:", error);
    archive.abort();
    passthrough.destroy(error instanceof Error ? error : new Error(String(error)));
  });

  const safeName = sanitizeZipFilename(filename ?? "download.zip");
  return new NextResponse(
    Readable.toWeb(passthrough) as unknown as ReadableStream,
    {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        "Cache-Control": "no-store",
      },
    }
  );
});

function appendEntry(
  archive: Archiver,
  body: Readable,
  name: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEntry = () => {
      cleanup();
      resolve();
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      archive.off("entry", onEntry);
      archive.off("error", onError);
    };
    // "entry" fires after the source stream is fully consumed — awaiting it
    // enforces sequential S3 fetches and prevents idle-timeout on later objects.
    archive.once("entry", onEntry);
    archive.once("error", onError);
    archive.append(body, { name });
  });
}
