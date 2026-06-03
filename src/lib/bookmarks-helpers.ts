export type BookmarkResponse = {
  id: string;
  connectionId: string;
  connectionName: string;
  bucket: string;
  prefix: string | null;
  label: string | null;
  createdAt: string;
};

export function getPathTail(prefix: string): string {
  return prefix.split("/").filter(Boolean).at(-1) ?? "";
}

export function findBookmark(
  bookmarks: BookmarkResponse[],
  connectionId: string,
  bucket: string,
  prefix: string | null
): BookmarkResponse | undefined {
  return bookmarks.find(
    (bm) =>
      bm.connectionId === connectionId &&
      bm.bucket === bucket &&
      bm.prefix === prefix
  );
}

export function isBookmarked(
  bookmarks: BookmarkResponse[],
  connectionId: string,
  bucket: string,
  prefix: string | null
): boolean {
  return findBookmark(bookmarks, connectionId, bucket, prefix) !== undefined;
}

export function getBucketBookmarks(
  bookmarks: BookmarkResponse[],
  connectionId: string
): BookmarkResponse[] {
  return bookmarks.filter(
    (bm) => bm.connectionId === connectionId && bm.prefix === null
  );
}

export function getPrefixBookmarks(
  bookmarks: BookmarkResponse[],
  connectionId: string,
  bucket: string
): BookmarkResponse[] {
  return bookmarks.filter(
    (bm) =>
      bm.connectionId === connectionId &&
      bm.bucket === bucket &&
      bm.prefix !== null
  );
}

export function reorderBucketPins(
  bookmarks: BookmarkResponse[],
  orderedIds: string[]
): BookmarkResponse[] {
  const pinIndex = new Map(orderedIds.map((id, i) => [id, i]));
  const bucketPins = bookmarks.filter((bm) => bm.prefix === null);
  const prefixPins = bookmarks.filter((bm) => bm.prefix !== null);
  const sorted = [...bucketPins].sort((a, b) => {
    const ai = pinIndex.get(a.id) ?? Infinity;
    const bi = pinIndex.get(b.id) ?? Infinity;
    return ai - bi;
  });
  return [...sorted, ...prefixPins];
}
