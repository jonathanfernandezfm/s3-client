export const queryKeys = {
  buckets: {
    all: ["buckets"] as const,
    list: () => [...queryKeys.buckets.all, "list"] as const,
  },
  objects: {
    all: ["objects"] as const,
    list: (bucket: string, prefix: string) =>
      [...queryKeys.objects.all, bucket, prefix] as const,
    detail: (bucket: string, key: string) =>
      [...queryKeys.objects.all, bucket, key, "detail"] as const,
  },
};
