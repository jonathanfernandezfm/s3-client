/**
 * Builds the value for an S3 CopyObject `CopySource` parameter
 * (the `x-amz-copy-source` header).
 *
 * Format: `${bucket}/${encodeURIComponent(key)}`, optionally with a
 * `?versionId=...` suffix. The bucket/key separator slash is kept LITERAL;
 * only the key (and versionId) are URL-encoded. This matches the
 * AWS-documented form and the behavior of the versioned copy/restore routes.
 * The AWS SDK passes CopySource through verbatim (no additional encoding),
 * so callers must encode here.
 */
export function buildCopySource(
  bucket: string,
  key: string,
  versionId?: string
): string {
  const base = `${bucket}/${encodeURIComponent(key)}`;
  return versionId
    ? `${base}?versionId=${encodeURIComponent(versionId)}`
    : base;
}
