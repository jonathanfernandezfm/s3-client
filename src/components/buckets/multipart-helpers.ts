import type { IncompleteUpload } from "@/types/s3";

export function sortUploadsByInitiated(uploads: IncompleteUpload[]): IncompleteUpload[] {
  return [...uploads].sort(
    (a, b) => new Date(a.initiated).getTime() - new Date(b.initiated).getTime()
  );
}

export function formatRelativeAge(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? "minute" : "minutes"} ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ${diffHr === 1 ? "hour" : "hours"} ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} ${diffDay === 1 ? "day" : "days"} ago`;

  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} ${diffMonth === 1 ? "month" : "months"} ago`;

  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear} ${diffYear === 1 ? "year" : "years"} ago`;
}

export function formatInitiator(upload: IncompleteUpload): string {
  return upload.initiatorDisplayName || upload.initiatorId || "Unknown";
}
