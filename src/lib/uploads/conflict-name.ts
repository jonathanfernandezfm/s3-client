/** Split a key into [dir, base, ext] where ext includes the leading dot (or ""). */
function splitKey(key: string): { dir: string; base: string; ext: string } {
  const slash = key.lastIndexOf("/");
  const dir = slash === -1 ? "" : key.slice(0, slash + 1);
  const name = slash === -1 ? key : key.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  // Treat a leading-dot name (".env") as having no extension.
  if (dot <= 0) return { dir, base: name, ext: "" };
  return { dir, base: name.slice(0, dot), ext: name.slice(dot) };
}

/**
 * Given a desired key and the set of keys already taken (existing on S3 *and*
 * already chosen in this batch), return the first non-colliding variant:
 * "a/photo.png" -> "a/photo (1).png" -> "a/photo (2).png" … If `key` itself is
 * free, it is returned unchanged.
 */
export function nextAvailableKey(key: string, taken: Set<string>): string {
  if (!taken.has(key)) return key;
  const { dir, base, ext } = splitKey(key);
  for (let n = 1; ; n++) {
    const candidate = `${dir}${base} (${n})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}
