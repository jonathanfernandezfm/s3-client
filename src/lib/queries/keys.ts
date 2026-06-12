export const queryKeys = {
  buckets: {
    all: ["buckets"] as const,
    list: (connectionId?: string) =>
      connectionId
        ? ([...queryKeys.buckets.all, "list", connectionId] as const)
        : ([...queryKeys.buckets.all, "list"] as const),
    byConnection: (connectionId: string) =>
      [...queryKeys.buckets.all, "connection", connectionId] as const,
  },
  objects: {
    all: ["objects"] as const,
    list: (connectionId: string, bucket: string, prefix: string) =>
      [...queryKeys.objects.all, connectionId, bucket, prefix] as const,
    detail: (connectionId: string, bucket: string, key: string) =>
      [...queryKeys.objects.all, connectionId, bucket, key, "detail"] as const,
  },
  presign: {
    all: ["presign"] as const,
    batch: (connectionId: string, bucket: string, sortedKeys: string[]) =>
      [...queryKeys.presign.all, "batch", connectionId, bucket, sortedKeys.join("|")] as const,
  },
  bookmarks: {
    all: ["bookmarks"] as const,
    list: (connectionId?: string, bucket?: string) =>
      connectionId && bucket
        ? ([...queryKeys.bookmarks.all, "list", connectionId, bucket] as const)
        : connectionId
        ? ([...queryKeys.bookmarks.all, "list", connectionId] as const)
        : ([...queryKeys.bookmarks.all, "list"] as const),
  },
  activity: {
    all: ["activity"] as const,
    list: (connectionId: string, bucket: string, prefix?: string, key?: string) =>
      [...queryKeys.activity.all, connectionId, bucket, prefix ?? "", key ?? ""] as const,
  },
  notes: {
    all: ["notes"] as const,
    forKey: (connectionId: string, bucket: string, key: string) =>
      [...queryKeys.notes.all, "key", connectionId, bucket, key] as const,
    counts: (connectionId: string, bucket: string, sortedKeys: string[]) =>
      [...queryKeys.notes.all, "counts", connectionId, bucket, sortedKeys.join("|")] as const,
    countsForBucket: (connectionId: string, bucket: string) =>
      [...queryKeys.notes.all, "counts", connectionId, bucket] as const,
  },
  tags: {
    all: ["tags"] as const,
    object: (connectionId: string, bucket: string, key: string) =>
      [...queryKeys.tags.all, "object", connectionId, bucket, key] as const,
    batch: (connectionId: string, bucket: string, sortedKeys: string[]) =>
      [...queryKeys.tags.all, "batch", connectionId, bucket, sortedKeys.join("|")] as const,
  },
  shareLinks: {
    all: ["share-links"] as const,
    list: (connectionId: string, bucket?: string, key?: string) =>
      [...queryKeys.shareLinks.all, "list", connectionId, bucket ?? "", key ?? ""] as const,
    detail: (id: string) =>
      [...queryKeys.shareLinks.all, "detail", id] as const,
    counts: (connectionId: string, bucket: string, sortedKeys: string[]) =>
      [...queryKeys.shareLinks.all, "counts", connectionId, bucket, sortedKeys.join("|")] as const,
  },
  multipartUploads: {
    all: ["multipart-uploads"] as const,
    byBucket: (connectionId: string, bucket: string) =>
      [...queryKeys.multipartUploads.all, connectionId, bucket] as const,
  },
  user: {
    subscription: () => ["user", "subscription"] as const,
  },
  versions: {
    all: ["versions"] as const,
    list: (connectionId: string, bucket: string, prefix: string, key: string) =>
      [...queryKeys.versions.all, connectionId, bucket, prefix, key] as const,
    presign: (connectionId: string, bucket: string, key: string, versionId: string) =>
      [...queryKeys.versions.all, "presign", connectionId, bucket, key, versionId] as const,
  },
  bucketVersioning: {
    all: ["bucket-versioning"] as const,
    status: (connectionId: string, bucket: string) =>
      [...queryKeys.bucketVersioning.all, connectionId, bucket] as const,
  },
  bucketStats: {
    all: ["bucket-stats"] as const,
    byBucket: (connectionId: string, bucket: string) =>
      [...queryKeys.bucketStats.all, connectionId, bucket] as const,
  },
  health: {
    all: ["health"] as const,
    connection: (id: string) =>
      [...queryKeys.health.all, "connection", id] as const,
    bucket: (id: string, bucket: string) =>
      [...queryKeys.health.all, "bucket", id, bucket] as const,
    summary: (id: string) =>
      [...queryKeys.health.all, "summary", id] as const,
  },
  search: {
    all: ["search"] as const,
    query: (q: string) => [...queryKeys.search.all, "query", q] as const,
  },
  searchIndex: {
    all: ["search-index"] as const,
    status: (connectionId: string) =>
      [...queryKeys.searchIndex.all, "status", connectionId] as const,
  },
};
