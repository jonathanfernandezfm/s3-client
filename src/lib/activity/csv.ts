export interface ActivityCsvRow {
  createdAt: string;        // ISO
  action: string;
  userDisplayName: string;
  userId: string | null;
  bucket: string;
  key: string | null;
  targetKey: string | null;
  byteSize: string | null;  // already stringified BigInt or null
  batchId: string | null;
}

const HEADERS = [
  "createdAt", "action", "userDisplayName", "userId",
  "bucket", "key", "targetKey", "byteSize", "batchId",
] as const;

/** RFC-4180-style field escaping: wrap in quotes if it contains "," <"> CR or LF; double internal quotes. */
export function escapeCsvField(value: string | null | undefined): string {
  const s = value ?? "";
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toActivityCsv(rows: ActivityCsvRow[]): string {
  const lines = [HEADERS.join(",")];
  for (const r of rows) {
    lines.push([
      r.createdAt, r.action, r.userDisplayName, r.userId,
      r.bucket, r.key, r.targetKey, r.byteSize, r.batchId,
    ].map(escapeCsvField).join(","));
  }
  // Trailing newline so the file ends cleanly.
  return lines.join("\r\n") + "\r\n";
}
