export const BUCKET_TAB_KEYS = ["overview", "multipart", "lifecycle", "permissions"] as const;
export type BucketTabKey = (typeof BUCKET_TAB_KEYS)[number];

// Human-readable URL slugs that map onto an internal tab key.
const ALIASES: Record<string, BucketTabKey> = {
  "incomplete-uploads": "multipart",
};

export function isBucketTabKey(value: string | null): value is BucketTabKey {
  return value !== null && (BUCKET_TAB_KEYS as readonly string[]).includes(value);
}

export function resolveBucketTab(value: string | null): BucketTabKey {
  if (isBucketTabKey(value)) return value;
  if (value && value in ALIASES) return ALIASES[value];
  return "overview";
}
