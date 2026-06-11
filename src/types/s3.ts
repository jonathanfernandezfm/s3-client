export interface S3Bucket {
  name: string;
  creationDate?: Date;
  connectionId: string;
}

export interface S3Object {
  key: string;
  lastModified?: Date;
  size?: number;
  etag?: string;
  storageClass?: string;
  isFolder: boolean;
}

export interface ListObjectsResponse {
  objects: S3Object[];
  prefixes: string[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

export interface IncompleteUpload {
  key: string;
  uploadId: string;
  initiated: string; // ISO timestamp
  storageClass: string | null;
  initiatorDisplayName: string | null;
  initiatorId: string | null;
}

export type BucketVersioningStatus = "Enabled" | "Suspended" | "Disabled";

export interface S3BucketVersioning {
  status: BucketVersioningStatus;
  mfaDeleteEnabled: boolean;
}

export interface S3ObjectVersion {
  key: string;
  versionId: string;
  isLatest: boolean;
  isDeleteMarker: boolean;
  lastModified?: string;
  size?: number;
  etag?: string;
  storageClass?: string;
  owner?: { id?: string; displayName?: string };
}

export interface ListObjectVersionsResponse {
  versions: S3ObjectVersion[];
  isTruncated: boolean;
  nextKeyMarker?: string;
  nextVersionIdMarker?: string;
}

export interface ObjectProperties {
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  /** x-amz-meta-* entries, keys without the prefix (S3 returns them lowercased). */
  metadata: Record<string, string>;
  /** HeadObject omits StorageClass for STANDARD, so the API defaults it. */
  storageClass: string;
  serverSideEncryption?: string;
  sseKmsKeyId?: string;
  size?: number;
  etag?: string;
  lastModified?: string;
  versionId?: string;
  /** Raw x-amz-restore header for archived objects, when present. */
  restore?: string;
}
