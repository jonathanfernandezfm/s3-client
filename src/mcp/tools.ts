import {
  ListBucketsCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { listConnectionsWithAccess, getConnectionAccessById } from "@/lib/db/connections";
import { createS3Client } from "@/lib/s3/client";
import { meterOperation } from "@/lib/subscriptions";
import type { AuthUser } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Tool 1: list_connections
// No metering — cheap DB read, no S3 call (mirrors GET /api/connections).
// ---------------------------------------------------------------------------

export interface ConnectionSummary {
  id: string;
  name: string | null;
  endpoint: string;
  region: string | null;
  role: string;
}

export async function listConnections(user: AuthUser): Promise<ConnectionSummary[]> {
  const entries = await listConnectionsWithAccess(user.id);
  return entries.map((e) => ({
    id: e.connection.id,
    name: e.connection.name,
    endpoint: e.connection.endpoint,
    region: e.connection.region ?? null,
    role: e.role,
  }));
}

// ---------------------------------------------------------------------------
// Tool 2: list_buckets
// ---------------------------------------------------------------------------

export interface BucketSummary {
  name: string;
  creationDate: string | null;
}

export async function listBuckets(
  user: AuthUser,
  args: { connectionId: string }
): Promise<BucketSummary[]> {
  const access = await getConnectionAccessById(args.connectionId, user.id);
  if (!access) {
    throw new Error("Connection not found");
  }

  const tier = user.subscription?.tier ?? "FREE";
  const meter = await meterOperation(user.id, tier);
  if (!meter.allowed) {
    throw new Error(meter.reason ?? "Operation limit reached");
  }

  const client = createS3Client(access.connection);
  const response = await client.send(new ListBucketsCommand({}));

  return (response.Buckets ?? []).map((b) => ({
    name: b.Name ?? "",
    creationDate: b.CreationDate ? b.CreationDate.toISOString() : null,
  }));
}

// ---------------------------------------------------------------------------
// Tool 3: list_objects
// Mirrors src/app/api/objects/route.ts exactly (Delimiter "/", MaxKeys 1000,
// CommonPrefixes → folders, Contents → files, drop the prefix row itself).
// ---------------------------------------------------------------------------

export interface S3ObjectEntry {
  key: string;
  isFolder: boolean;
  lastModified?: string;
  size?: number;
  etag?: string;
  storageClass?: string;
}

export interface ListObjectsResult {
  objects: S3ObjectEntry[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

export async function listObjects(
  user: AuthUser,
  args: {
    connectionId: string;
    bucket: string;
    prefix?: string;
    continuationToken?: string;
  }
): Promise<ListObjectsResult> {
  const access = await getConnectionAccessById(args.connectionId, user.id);
  if (!access) {
    throw new Error("Connection not found");
  }

  const tier = user.subscription?.tier ?? "FREE";
  const meter = await meterOperation(user.id, tier);
  if (!meter.allowed) {
    throw new Error(meter.reason ?? "Operation limit reached");
  }

  const prefix = args.prefix ?? "";
  const client = createS3Client(access.connection);
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: args.bucket,
      Prefix: prefix,
      Delimiter: "/",
      MaxKeys: 1000,
      ContinuationToken: args.continuationToken,
    })
  );

  const folders: S3ObjectEntry[] = (response.CommonPrefixes ?? []).map((p) => ({
    key: p.Prefix ?? "",
    isFolder: true,
  }));

  const files: S3ObjectEntry[] = (response.Contents ?? [])
    .filter((obj) => obj.Key !== prefix)
    .map((obj) => ({
      key: obj.Key ?? "",
      isFolder: false,
      lastModified: obj.LastModified ? obj.LastModified.toISOString() : undefined,
      size: obj.Size,
      etag: obj.ETag,
      storageClass: obj.StorageClass,
    }));

  return {
    objects: [...folders, ...files],
    isTruncated: response.IsTruncated ?? false,
    nextContinuationToken: response.NextContinuationToken,
  };
}

// ---------------------------------------------------------------------------
// Tool 4: head_object
// ---------------------------------------------------------------------------

export interface HeadObjectResult {
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: string;
  storageClass?: string;
  metadata?: Record<string, string>;
}

export async function headObject(
  user: AuthUser,
  args: { connectionId: string; bucket: string; key: string }
): Promise<HeadObjectResult> {
  const access = await getConnectionAccessById(args.connectionId, user.id);
  if (!access) {
    throw new Error("Connection not found");
  }

  const tier = user.subscription?.tier ?? "FREE";
  const meter = await meterOperation(user.id, tier);
  if (!meter.allowed) {
    throw new Error(meter.reason ?? "Operation limit reached");
  }

  const client = createS3Client(access.connection);
  try {
    const response = await client.send(
      new HeadObjectCommand({ Bucket: args.bucket, Key: args.key })
    );

    return {
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      etag: response.ETag,
      lastModified: response.LastModified ? response.LastModified.toISOString() : undefined,
      storageClass: response.StorageClass,
      metadata: response.Metadata,
    };
  } catch (err) {
    const code =
      (err as { name?: string; $metadata?: { httpStatusCode?: number } }).name ??
      "";
    const status =
      (err as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode ?? 0;
    if (code === "NotFound" || status === 404) {
      throw new Error("Object not found");
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Tool 5: presign_download
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface PresignDownloadResult {
  url: string;
  expiresIn: number;
}

export async function presignDownload(
  user: AuthUser,
  args: {
    connectionId: string;
    bucket: string;
    key: string;
    expiresIn?: number;
  }
): Promise<PresignDownloadResult> {
  const access = await getConnectionAccessById(args.connectionId, user.id);
  if (!access) {
    throw new Error("Connection not found");
  }

  const tier = user.subscription?.tier ?? "FREE";
  const meter = await meterOperation(user.id, tier);
  if (!meter.allowed) {
    throw new Error(meter.reason ?? "Operation limit reached");
  }

  const expiresIn = clamp(args.expiresIn ?? 900, 60, 3600);
  const client = createS3Client(access.connection);
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: args.bucket, Key: args.key }),
    { expiresIn }
  );

  return { url, expiresIn };
}
