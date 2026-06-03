import prisma from "./prisma";
import { getConnectionAccessById } from "./connections";
import type { BookmarkResponse } from "@/lib/bookmarks-helpers";

export async function listBookmarks(
  userId: string,
  connectionId?: string | null,
  bucket?: string | null
): Promise<BookmarkResponse[]> {
  const where: Record<string, unknown> = { userId };

  if (connectionId) {
    where.connectionId = connectionId;
    if (bucket) {
      where.bucket = bucket;
    }
  }

  const bookmarks = await prisma.bookmark.findMany({
    where,
    include: { connection: { select: { name: true, endpoint: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  const results: BookmarkResponse[] = [];

  for (const bm of bookmarks) {
    const access = await getConnectionAccessById(bm.connectionId, userId);
    if (!access) {
      continue;
    }

    results.push({
      id: bm.id,
      connectionId: bm.connectionId,
      connectionName: bm.connection.name || bm.connection.endpoint,
      bucket: bm.bucket,
      prefix: bm.prefix,
      label: bm.label,
      createdAt: bm.createdAt.toISOString(),
    });
  }

  return results;
}

export async function createBookmark(
  userId: string,
  connectionId: string,
  bucket: string,
  prefix?: string | null
): Promise<BookmarkResponse | null> {
  const access = await getConnectionAccessById(connectionId, userId);
  if (!access) {
    return null;
  }

  const normalizedPrefix = prefix ?? null;
  const include = { connection: { select: { name: true, endpoint: true } } } as const;

  const existing = await prisma.bookmark.findFirst({
    where: { userId, connectionId, bucket, prefix: normalizedPrefix },
    include,
  });

  const bm = existing ?? await prisma.bookmark.create({
    data: { userId, connectionId, bucket, prefix: normalizedPrefix },
    include,
  });

  return {
    id: bm.id,
    connectionId: bm.connectionId,
    connectionName: bm.connection.name || bm.connection.endpoint,
    bucket: bm.bucket,
    prefix: bm.prefix,
    label: bm.label,
    createdAt: bm.createdAt.toISOString(),
  };
}

export async function deleteBookmark(
  userId: string,
  bookmarkId: string
): Promise<boolean> {
  const bookmark = await prisma.bookmark.findUnique({
    where: { id: bookmarkId },
  });

  if (!bookmark || bookmark.userId !== userId) {
    return false;
  }

  await prisma.bookmark.delete({ where: { id: bookmarkId } });

  return true;
}

export async function reorderBookmarks(
  userId: string,
  ids: string[]
): Promise<boolean> {
  if (ids.length === 0) {
    return false;
  }

  const existing = await prisma.bookmark.findMany({ where: { userId } });
  const ownedIds = new Set(existing.map((bm) => bm.id));

  if (ids.some((id) => !ownedIds.has(id))) {
    return false;
  }

  const updates = ids.map((id, index) =>
    prisma.bookmark.update({ where: { id }, data: { sortOrder: index } })
  );

  await prisma.$transaction(updates);

  return true;
}
