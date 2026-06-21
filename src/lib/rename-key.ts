export type RenameTarget =
  | { ok: true; targetKey: string }
  | { ok: false; error: string };

/** Compute the new full object key when renaming just the basename of `sourceKey`. */
export function computeRenameTarget(sourceKey: string, newName: string): RenameTarget {
  const trimmed = newName.trim();
  if (trimmed.length === 0) return { ok: false, error: "Name cannot be empty" };
  if (trimmed.includes("/")) return { ok: false, error: "Name cannot contain '/'" };
  const slash = sourceKey.lastIndexOf("/");
  const prefix = slash === -1 ? "" : sourceKey.slice(0, slash + 1);
  const currentName = slash === -1 ? sourceKey : sourceKey.slice(slash + 1);
  if (trimmed === currentName) return { ok: false, error: "unchanged" };
  return { ok: true, targetKey: prefix + trimmed };
}

/** The basename portion of an object key (no trailing slash handling needed for files). */
export function basename(key: string): string {
  const slash = key.lastIndexOf("/");
  return slash === -1 ? key : key.slice(slash + 1);
}
