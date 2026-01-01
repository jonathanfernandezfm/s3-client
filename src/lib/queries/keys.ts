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
};
