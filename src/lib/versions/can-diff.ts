export const DIFF_MAX_BYTES = 1_048_576; // 1 MB

const TEXT_EXTENSIONS = new Set([
  "md", "json", "yaml", "yml", "csv", "txt", "log", "js", "ts", "tsx", "jsx",
  "css", "html", "xml", "sql", "sh", "py", "go", "rs", "java", "kt",
]);

export interface DiffCandidate {
  key: string;
  versionId: string;
  isDeleteMarker: boolean;
  size?: number;
  contentType?: string;
}

export type CanDiffResult =
  | { ok: true }
  | { ok: false; reason: "wrongCount" | "deleteMarker" | "tooLarge" | "binary" };

function isTextLike(item: DiffCandidate): boolean {
  if (item.contentType) {
    return item.contentType.startsWith("text/");
  }
  const dot = item.key.lastIndexOf(".");
  if (dot < 0) return false;
  return TEXT_EXTENSIONS.has(item.key.slice(dot + 1).toLowerCase());
}

export function canDiff(items: DiffCandidate[]): CanDiffResult {
  if (items.length !== 2) return { ok: false, reason: "wrongCount" };
  for (const item of items) {
    if (item.isDeleteMarker) return { ok: false, reason: "deleteMarker" };
  }
  for (const item of items) {
    if ((item.size ?? 0) > DIFF_MAX_BYTES) return { ok: false, reason: "tooLarge" };
  }
  for (const item of items) {
    if (!isTextLike(item)) return { ok: false, reason: "binary" };
  }
  return { ok: true };
}
