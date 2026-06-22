/** Display name shown in the browser = final path segment of the key. */
export function objectDisplayName(key: string): string {
  const trimmed = key.endsWith("/") ? key.slice(0, -1) : key;
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

/**
 * Case-insensitive substring filter over an object list by display name.
 * An empty/whitespace query returns the input array unchanged (same reference).
 */
export function filterObjectsByName<T extends { key: string }>(
  objects: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return objects;
  return objects.filter((o) => objectDisplayName(o.key).toLowerCase().includes(q));
}
