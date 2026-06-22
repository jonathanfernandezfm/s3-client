export function parentPrefix(key: string): string {
  if (key.endsWith("/")) return key;

  const lastSlash = key.lastIndexOf("/");
  return lastSlash < 0 ? "" : key.slice(0, lastSlash + 1);
}

export function browserRouteHref({
  connectionId,
  bucket,
  path = "",
}: {
  connectionId: string;
  bucket: string;
  path?: string;
}): string {
  const base = `/app/browser/${encodeURIComponent(connectionId)}/${encodeURIComponent(bucket)}`;
  const segments = path.split("/").filter(Boolean).map(encodeURIComponent);

  return segments.length > 0 ? `${base}/${segments.join("/")}` : base;
}
