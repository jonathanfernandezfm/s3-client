/** Build the canonical s3:// URI for an object. */
export function s3Uri(bucket: string, key: string): string {
  return `s3://${bucket}/${key}`;
}

/**
 * Build a best-effort HTTP object URL from the connection endpoint.
 * forcePathStyle (MinIO and most S3-compatible) → {endpoint}/{bucket}/{key}.
 * Virtual-hosted (AWS default) → {scheme}://{bucket}.{host}/{key}.
 * Each path segment of the key is encoded; "/" separators are preserved.
 * This is a convenience URL: it is NOT signed and only resolves for
 * publicly-readable objects or buckets configured for anonymous GET.
 */
export function objectHttpUrl(
  endpoint: string,
  bucket: string,
  key: string,
  forcePathStyle: boolean
): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const trimmed = endpoint.replace(/\/+$/, "");
  if (forcePathStyle) {
    return `${trimmed}/${bucket}/${encodedKey}`;
  }
  try {
    const u = new URL(trimmed);
    return `${u.protocol}//${bucket}.${u.host}/${encodedKey}`;
  } catch {
    return `${trimmed}/${bucket}/${encodedKey}`;
  }
}
