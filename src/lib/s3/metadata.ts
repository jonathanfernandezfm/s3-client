import type {
  CopyObjectCommandInput,
  HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";

export interface MetadataEdits {
  contentType: string;
  cacheControl: string;
  metadata: Record<string, string>;
  storageClass: string;
}

// Single-part CopyObject tops out at 5 GB; larger objects need multipart copy,
// which is out of scope for in-place metadata edits.
export const MAX_COPY_SIZE = 5 * 1024 * 1024 * 1024;

export class MetadataEditError extends Error {}

const METADATA_KEY_PATTERN = /^[a-z0-9._-]+$/;
const ASCII_PATTERN = /^[\x20-\x7e]*$/;

export function buildMetadataCopyParams(
  bucket: string,
  key: string,
  head: HeadObjectCommandOutput,
  edits: MetadataEdits
): CopyObjectCommandInput {
  if (key.endsWith("/")) {
    throw new MetadataEditError("Folders do not support metadata editing");
  }
  if ((head.ContentLength ?? 0) > MAX_COPY_SIZE) {
    throw new MetadataEditError(
      "Objects larger than 5 GB cannot be edited in place"
    );
  }
  const archived =
    head.StorageClass === "GLACIER" || head.StorageClass === "DEEP_ARCHIVE";
  const restored = head.Restore?.includes('ongoing-request="false"') ?? false;
  if (archived && !restored) {
    throw new MetadataEditError(
      "Archived objects must be restored before their metadata can be edited"
    );
  }

  const metadata: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(edits.metadata)) {
    const cleanKey = rawKey.trim().toLowerCase();
    if (!cleanKey) continue;
    if (!METADATA_KEY_PATTERN.test(cleanKey)) {
      throw new MetadataEditError(`Invalid metadata key: "${rawKey}"`);
    }
    if (!ASCII_PATTERN.test(value)) {
      throw new MetadataEditError(
        `Metadata value for "${rawKey}" must contain only ASCII characters`
      );
    }
    metadata[cleanKey] = value;
  }

  const contentType = edits.contentType.trim();
  const cacheControl = edits.cacheControl.trim();
  const storageClass = edits.storageClass.trim() || "STANDARD";

  return {
    Bucket: bucket,
    Key: key,
    CopySource: encodeURIComponent(`${bucket}/${key}`),
    MetadataDirective: "REPLACE",
    Metadata: metadata,
    StorageClass: storageClass as CopyObjectCommandInput["StorageClass"],
    ...(contentType ? { ContentType: contentType } : {}),
    ...(cacheControl ? { CacheControl: cacheControl } : {}),
    ...(head.ContentDisposition
      ? { ContentDisposition: head.ContentDisposition }
      : {}),
    ...(head.ContentEncoding ? { ContentEncoding: head.ContentEncoding } : {}),
    ...(head.ContentLanguage ? { ContentLanguage: head.ContentLanguage } : {}),
    ...(head.Expires ? { Expires: head.Expires } : {}),
    ...(head.ServerSideEncryption
      ? { ServerSideEncryption: head.ServerSideEncryption }
      : {}),
    ...(head.ServerSideEncryption === "aws:kms" && head.SSEKMSKeyId
      ? { SSEKMSKeyId: head.SSEKMSKeyId }
      : {}),
  };
}
