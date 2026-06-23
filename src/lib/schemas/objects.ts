import { z } from "zod";

// Reusable building blocks
const ConnectionId = z.string().uuid();
const BucketName = z.string().min(1).max(63);
const ObjectKey = z.string().min(1);
// Folder targets need to allow empty string (root) — narrow to a non-key
// shape if the route accepts a folder vs an object distinctly.
const FolderPath = z.string();

export const DeleteObjectsRequest = z.object({
  connectionId: ConnectionId,
  bucket: BucketName,
  keys: z.array(ObjectKey).min(1).max(1000),
});
export type DeleteObjectsRequest = z.infer<typeof DeleteObjectsRequest>;

export const CopyObjectsRequest = z.object({
  sourceConnectionId: ConnectionId,
  sourceBucket: BucketName,
  sourceKeys: z.array(ObjectKey).min(1).max(1000),
  targetConnectionId: ConnectionId,
  targetBucket: BucketName,
  targetPath: FolderPath,
});
export type CopyObjectsRequest = z.infer<typeof CopyObjectsRequest>;

// Move and copy share their body shape; if the route file currently
// uses identical fields, alias rather than redeclare:
export const MoveObjectsRequest = CopyObjectsRequest;
export type MoveObjectsRequest = z.infer<typeof MoveObjectsRequest>;

export const RenameObjectRequest = z.object({
  connectionId: ConnectionId,
  bucket: BucketName,
  sourceKey: ObjectKey,
  targetKey: ObjectKey,
});
export type RenameObjectRequest = z.infer<typeof RenameObjectRequest>;
