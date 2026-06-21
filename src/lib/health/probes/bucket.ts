// src/lib/health/probes/bucket.ts
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetBucketVersioningCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
} from "@aws-sdk/client-s3";
import { buildCopySource } from "@/lib/s3/copy-source";
import { classifyError } from "../classify";
import type { Probe, ProbeRunOutcome } from "../probe";

const SOURCE_KEY_PREFIX = "__s3client-healthcheck__/source-";
const DEST_KEY_PREFIX = "__s3client-healthcheck__/dest-";
// Deliberately wrong base64 MD5 — does not match an empty body. S3 evaluates
// auth before Content-MD5 validation across all providers.
const BAD_CONTENT_MD5 = "AAAAAAAAAAAAAAAAAAAAAA==";

function elapsed(start: number): number {
  return Math.max(0, performance.now() - start);
}

const listObjects: Probe = {
  key: "list-objects-v2",
  capability: "browse-objects",
  scope: "bucket",
  required: true,
  async run({ client, bucket }): Promise<ProbeRunOutcome> {
    const start = performance.now();
    try {
      await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
      return { result: "granted", durationMs: elapsed(start) };
    } catch (err) {
      const { result, errorCode } = classifyError(err);
      return { result, errorCode, durationMs: elapsed(start) };
    }
  },
};

const headObject: Probe = {
  key: "head-object",
  capability: "download-objects",
  scope: "bucket",
  required: true,
  async run({ client, bucket, randomKey }): Promise<ProbeRunOutcome> {
    const start = performance.now();
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: randomKey }));
      return { result: "granted", durationMs: elapsed(start) };
    } catch (err) {
      const { result, errorCode } = classifyError(err);
      return { result, errorCode, durationMs: elapsed(start) };
    }
  },
};

const putObject: Probe = {
  key: "put-object",
  capability: "upload-objects",
  scope: "bucket",
  required: true,
  async run({ client, bucket, randomKey }): Promise<ProbeRunOutcome> {
    const start = performance.now();
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: randomKey,
          Body: new Uint8Array(0),
          ContentMD5: BAD_CONTENT_MD5,
        }),
      );
      return { result: "granted", durationMs: elapsed(start) };
    } catch (err) {
      const { result, errorCode } = classifyError(err);
      return { result, errorCode, durationMs: elapsed(start) };
    }
  },
};

const deleteObject: Probe = {
  key: "delete-object",
  capability: "delete-objects",
  scope: "bucket",
  required: true,
  async run({ client, bucket, randomKey }): Promise<ProbeRunOutcome> {
    const start = performance.now();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: randomKey }));
      return { result: "granted", durationMs: elapsed(start) };
    } catch (err) {
      const { result, errorCode } = classifyError(err);
      return { result, errorCode, durationMs: elapsed(start) };
    }
  },
};

const copyObject: Probe = {
  key: "copy-object",
  capability: "copy-objects",
  scope: "bucket",
  required: true,
  async run({ client, bucket, randomKey }): Promise<ProbeRunOutcome> {
    const start = performance.now();
    const suffix = randomKey.split("-").pop() ?? "nonexistent";
    try {
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: `${DEST_KEY_PREFIX}${suffix}`,
          CopySource: buildCopySource(bucket!, `${SOURCE_KEY_PREFIX}${suffix}`),
        }),
      );
      return { result: "granted", durationMs: elapsed(start) };
    } catch (err) {
      const { result, errorCode } = classifyError(err);
      return { result, errorCode, durationMs: elapsed(start) };
    }
  },
};

const getObjectTagging: Probe = {
  key: "get-object-tagging",
  capability: "object-tagging",
  scope: "bucket",
  required: true,
  async run({ client, bucket, randomKey }): Promise<ProbeRunOutcome> {
    const start = performance.now();
    try {
      await client.send(
        new GetObjectTaggingCommand({ Bucket: bucket, Key: randomKey }),
      );
      return { result: "granted", durationMs: elapsed(start) };
    } catch (err) {
      const { result, errorCode } = classifyError(err);
      return { result, errorCode, durationMs: elapsed(start) };
    }
  },
};

const putObjectTagging: Probe = {
  key: "put-object-tagging",
  capability: "object-tagging",
  scope: "bucket",
  required: true,
  async run({ client, bucket, randomKey }): Promise<ProbeRunOutcome> {
    const start = performance.now();
    try {
      await client.send(
        new PutObjectTaggingCommand({
          Bucket: bucket,
          Key: randomKey,
          Tagging: { TagSet: [] },
        }),
      );
      return { result: "granted", durationMs: elapsed(start) };
    } catch (err) {
      const { result, errorCode } = classifyError(err);
      return { result, errorCode, durationMs: elapsed(start) };
    }
  },
};

const listObjectVersions: Probe = {
  key: "list-object-versions",
  capability: "list-versions",
  scope: "bucket",
  required: true,
  async run({ client, bucket }): Promise<ProbeRunOutcome> {
    const start = performance.now();
    try {
      await client.send(
        new ListObjectVersionsCommand({ Bucket: bucket, MaxKeys: 1 }),
      );
      return { result: "granted", durationMs: elapsed(start) };
    } catch (err) {
      const { result, errorCode } = classifyError(err);
      return { result, errorCode, durationMs: elapsed(start) };
    }
  },
};

const getBucketVersioning: Probe = {
  key: "get-bucket-versioning",
  capability: "manage-versioning",
  scope: "bucket",
  required: true,
  async run({ client, bucket }): Promise<ProbeRunOutcome> {
    const start = performance.now();
    try {
      await client.send(new GetBucketVersioningCommand({ Bucket: bucket }));
      return { result: "granted", durationMs: elapsed(start) };
    } catch (err) {
      const { result, errorCode } = classifyError(err);
      return { result, errorCode, durationMs: elapsed(start) };
    }
  },
};

const putBucketVersioning: Probe = {
  key: "put-bucket-versioning",
  capability: "manage-versioning",
  scope: "bucket",
  required: true,
  async run({ client, bucket }): Promise<ProbeRunOutcome> {
    const start = performance.now();
    let currentStatus: "Enabled" | "Suspended" | undefined;
    try {
      const current = await client.send(
        new GetBucketVersioningCommand({ Bucket: bucket }),
      );
      currentStatus = current.Status;
    } catch (err) {
      const { result, errorCode } = classifyError(err);
      return { result, errorCode, durationMs: elapsed(start) };
    }

    if (!currentStatus) {
      return { result: "skipped", durationMs: elapsed(start) };
    }

    try {
      await client.send(
        new PutBucketVersioningCommand({
          Bucket: bucket,
          VersioningConfiguration: { Status: currentStatus },
        }),
      );
      return { result: "granted", durationMs: elapsed(start) };
    } catch (err) {
      const { result, errorCode } = classifyError(err);
      return { result, errorCode, durationMs: elapsed(start) };
    }
  },
};

const listMultipartUploads: Probe = {
  key: "list-multipart-uploads",
  capability: "view-multipart",
  scope: "bucket",
  required: true,
  async run({ client, bucket }): Promise<ProbeRunOutcome> {
    const start = performance.now();
    try {
      await client.send(
        new ListMultipartUploadsCommand({ Bucket: bucket, MaxUploads: 1 }),
      );
      return { result: "granted", durationMs: elapsed(start) };
    } catch (err) {
      const { result, errorCode } = classifyError(err);
      return { result, errorCode, durationMs: elapsed(start) };
    }
  },
};

const corsDirectUploads: Probe = {
  key: "get-bucket-cors",
  capability: "cors-direct-uploads",
  scope: "bucket",
  required: true,
  async run({ client, bucket }): Promise<ProbeRunOutcome> {
    const start = performance.now();
    try {
      const { CORSRules } = await client.send(
        new GetBucketCorsCommand({ Bucket: bucket }),
      );
      const valid = (CORSRules ?? []).some(
        (r) =>
          r.AllowedMethods?.includes("PUT") &&
          r.ExposeHeaders?.includes("ETag"),
      );
      if (valid) {
        return { result: "granted", durationMs: elapsed(start) };
      }
      return { result: "denied", errorCode: "misconfigured", durationMs: elapsed(start) };
    } catch (err) {
      const e = err as { name?: string; Code?: string };
      const name = e.name ?? e.Code ?? "";
      if (name === "NoSuchCORSConfiguration") {
        return { result: "denied", errorCode: "not_configured", durationMs: elapsed(start) };
      }
      const { result, errorCode } = classifyError(err);
      return { result, errorCode, durationMs: elapsed(start) };
    }
  },
};

export const BUCKET_PROBES: Probe[] = [
  listObjects,
  headObject,
  putObject,
  deleteObject,
  copyObject,
  getObjectTagging,
  putObjectTagging,
  listObjectVersions,
  getBucketVersioning,
  putBucketVersioning,
  listMultipartUploads,
  corsDirectUploads,
];
