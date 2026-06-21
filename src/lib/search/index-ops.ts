import prisma from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { extOf, mimeFromExt } from "./mime-from-ext";
import { isSearchIndexEnabled } from "./feature-flag";

export type IndexUpsertInput = {
  workspaceId: string;
  connectionId: string;
  bucket: string;
  key: string;
  size: bigint;
  lastModified: Date;
  etag: string | null;
};

function buildIndexFields(input: IndexUpsertInput) {
  const ext = extOf(input.key);
  const mime = mimeFromExt(ext);
  return {
    workspaceId: input.workspaceId,
    connectionId: input.connectionId,
    bucket: input.bucket,
    key: input.key,
    size: input.size,
    lastModified: input.lastModified,
    etag: input.etag,
    extension: ext,
    mime,
    lastSeenAt: new Date(),
  };
}

function logFailure(op: string, ctx: Record<string, unknown>, err: unknown) {
  console.error(`[search-index] ${op} failed`, { ...ctx, err });
}

export async function indexUpsert(input: IndexUpsertInput): Promise<void> {
  if (!isSearchIndexEnabled()) return;
  try {
    const fields = buildIndexFields(input);
    await prisma.objectIndex.upsert({
      where: {
        connectionId_bucket_key: {
          connectionId: input.connectionId,
          bucket: input.bucket,
          key: input.key,
        },
      },
      create: fields,
      update: {
        size: fields.size,
        lastModified: fields.lastModified,
        etag: fields.etag,
        extension: fields.extension,
        mime: fields.mime,
        lastSeenAt: fields.lastSeenAt,
      },
    });
  } catch (err) {
    logFailure("upsert", { key: input.key, connectionId: input.connectionId }, err);
  }
}

export async function indexBulkUpsert(items: IndexUpsertInput[]): Promise<void> {
  if (!isSearchIndexEnabled()) return;
  if (items.length === 0) return;
  try {
    const now = new Date();
    const values = items.map((i) => {
      const f = buildIndexFields(i);
      return Prisma.sql`(${crypto.randomUUID()}, ${f.workspaceId}, ${f.connectionId}, ${f.bucket}, ${f.key}, ${f.size}, ${f.lastModified}, ${f.etag}, ${f.extension}, ${f.mime}, ${Prisma.raw("'[]'::jsonb")}, ${now}, ${now}, ${now})`;
    });
    await prisma.$executeRaw`
      INSERT INTO "object_index"
        ("id", "workspaceId", "connectionId", "bucket", "key", "size", "lastModified",
         "etag", "extension", "mime", "tags", "lastSeenAt", "createdAt", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("connectionId", "bucket", "key") DO UPDATE SET
        "size"         = EXCLUDED."size",
        "lastModified" = EXCLUDED."lastModified",
        "etag"         = EXCLUDED."etag",
        "extension"    = EXCLUDED."extension",
        "mime"         = EXCLUDED."mime",
        "lastSeenAt"   = EXCLUDED."lastSeenAt",
        "updatedAt"    = EXCLUDED."updatedAt"
    `;
  } catch (err) {
    logFailure("bulkUpsert", { count: items.length }, err);
  }
}

export async function indexDelete(input: {
  connectionId: string;
  bucket: string;
  key: string;
}): Promise<void> {
  if (!isSearchIndexEnabled()) return;
  try {
    await prisma.objectIndex.deleteMany({
      where: {
        connectionId: input.connectionId,
        bucket: input.bucket,
        key: input.key,
      },
    });
  } catch (err) {
    logFailure("delete", input, err);
  }
}

export async function indexBulkDelete(input: {
  connectionId: string;
  bucket: string;
  keys: string[];
}): Promise<void> {
  if (!isSearchIndexEnabled()) return;
  if (input.keys.length === 0) return;
  try {
    await prisma.objectIndex.deleteMany({
      where: {
        connectionId: input.connectionId,
        bucket: input.bucket,
        key: { in: input.keys },
      },
    });
  } catch (err) {
    logFailure(
      "bulkDelete",
      { connectionId: input.connectionId, bucket: input.bucket, count: input.keys.length },
      err
    );
  }
}

export async function indexDeleteBucket(input: {
  connectionId: string;
  bucket: string;
}): Promise<void> {
  if (!isSearchIndexEnabled()) return;
  try {
    await prisma.objectIndex.deleteMany({
      where: { connectionId: input.connectionId, bucket: input.bucket },
    });
  } catch (err) {
    logFailure("deleteBucket", input, err);
  }
}

export async function indexRename(input: {
  workspaceId: string;
  connectionId: string;
  bucket: string;
  fromKey: string;
  toKey: string;
  size: bigint;
  lastModified: Date;
  etag: string | null;
}): Promise<void> {
  if (!isSearchIndexEnabled()) return;
  try {
    const created = buildIndexFields({
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      bucket: input.bucket,
      key: input.toKey,
      size: input.size,
      lastModified: input.lastModified,
      etag: input.etag,
    });
    await prisma.$transaction([
      prisma.objectIndex.deleteMany({
        where: {
          connectionId: input.connectionId,
          bucket: input.bucket,
          key: input.fromKey,
        },
      }),
      prisma.objectIndex.upsert({
        where: {
          connectionId_bucket_key: {
            connectionId: input.connectionId,
            bucket: input.bucket,
            key: input.toKey,
          },
        },
        create: created,
        update: {
          size: created.size,
          lastModified: created.lastModified,
          etag: created.etag,
          extension: created.extension,
          mime: created.mime,
          lastSeenAt: created.lastSeenAt,
        },
      }),
    ]);
  } catch (err) {
    logFailure("rename", { from: input.fromKey, to: input.toKey }, err);
  }
}

export async function indexUpdateTags(input: {
  connectionId: string;
  bucket: string;
  key: string;
  tags: string[];
}): Promise<void> {
  if (!isSearchIndexEnabled()) return;
  try {
    await prisma.objectIndex.update({
      where: {
        connectionId_bucket_key: {
          connectionId: input.connectionId,
          bucket: input.bucket,
          key: input.key,
        },
      },
      data: { tags: input.tags },
    });
  } catch (err) {
    // Common case: row doesn't exist yet (initial crawl hasn't run for this key).
    if ((err as { code?: string }).code !== "P2025") {
      logFailure("updateTags", input, err);
    }
  }
}

export async function indexTagsForKeys(input: {
  connectionId: string;
  bucket: string;
  keys: string[];
}): Promise<Record<string, string[]>> {
  if (!isSearchIndexEnabled()) return {};
  if (input.keys.length === 0) return {};
  try {
    const rows = await prisma.objectIndex.findMany({
      where: {
        connectionId: input.connectionId,
        bucket: input.bucket,
        key: { in: input.keys },
      },
      select: { key: true, tags: true },
    });
    const out: Record<string, string[]> = {};
    for (const row of rows) {
      const tags = Array.isArray(row.tags)
        ? row.tags.filter((t): t is string => typeof t === "string")
        : [];
      if (tags.length > 0) out[row.key] = tags;
    }
    return out;
  } catch (err) {
    logFailure(
      "tagsForKeys",
      { connectionId: input.connectionId, bucket: input.bucket, count: input.keys.length },
      err
    );
    return {};
  }
}
