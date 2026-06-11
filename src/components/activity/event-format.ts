import type { ActivityAction } from "@/generated/prisma/client";
import type { ActivityEventResponse } from "@/lib/queries/activity";

export const ACTION_VERBS: Record<ActivityAction, string> = {
  UPLOAD: "uploaded",
  DELETE: "deleted",
  COPY: "copied",
  MOVE: "moved",
  RENAME: "renamed",
  FOLDER_CREATE: "created folder",
  TAG_CHANGE: "updated tags on",
  METADATA_CHANGE: "updated properties of",
  BUCKET_CREATE: "created bucket",
  BUCKET_DELETE: "deleted bucket",
  SHARE_CREATED: "shared",
  SHARE_REVOKED: "revoked share for",
  MULTIPART_ABORT: "aborted",
  VERSION_RESTORE: "restored a version of",
  VERSION_UNDELETE: "undeleted",
  VERSION_PURGE: "permanently deleted a version of",
  BUCKET_VERSIONING_ENABLE: "enabled versioning on",
  BUCKET_VERSIONING_SUSPEND: "suspended versioning on",
};

export function lastSegment(path: string): string {
  const trimmed = path.replace(/\/$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

export function eventTarget(event: ActivityEventResponse): string {
  const { action, key, targetKey, bucket } = event;
  if (!key) return bucket;
  if ((action === "RENAME" || action === "MOVE") && targetKey) {
    return `${lastSegment(key)} → ${lastSegment(targetKey)}`;
  }
  return lastSegment(key);
}
