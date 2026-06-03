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
};
