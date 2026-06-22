import type { GetObjectCommandOutput, PutObjectCommandInput } from "@aws-sdk/client-s3";

export interface SourceTag {
  key: string;
  value: string;
}

export interface FidelityParams {
  ContentType?: string;
  CacheControl?: string;
  ContentDisposition?: string;
  ContentEncoding?: string;
  ContentLanguage?: string;
  Metadata?: Record<string, string>;
  StorageClass?: PutObjectCommandInput["StorageClass"];
  Tagging?: string;
}

/** Encode a tag set as the `Tagging` query-string PutObject expects. */
export function encodeTagging(tags: SourceTag[]): string | undefined {
  if (!tags.length) return undefined;
  return tags
    .map((t) => `${encodeURIComponent(t.key)}=${encodeURIComponent(t.value)}`)
    .join("&");
}

/**
 * Build the system-header + metadata + tag params to carry from a source object
 * onto a cross-endpoint Upload. Only defined fields are included so we never
 * overwrite a header with `undefined`. `storageClass` is passed separately
 * because GetObject responses often omit it.
 */
export function buildFidelityParams(
  head: Pick<
    GetObjectCommandOutput,
    | "ContentType"
    | "CacheControl"
    | "ContentDisposition"
    | "ContentEncoding"
    | "ContentLanguage"
    | "Metadata"
  >,
  tags: SourceTag[],
  storageClass?: string
): FidelityParams {
  const out: FidelityParams = {};
  if (head.ContentType) out.ContentType = head.ContentType;
  if (head.CacheControl) out.CacheControl = head.CacheControl;
  if (head.ContentDisposition) out.ContentDisposition = head.ContentDisposition;
  if (head.ContentEncoding) out.ContentEncoding = head.ContentEncoding;
  if (head.ContentLanguage) out.ContentLanguage = head.ContentLanguage;
  if (head.Metadata && Object.keys(head.Metadata).length > 0) {
    out.Metadata = head.Metadata;
  }
  if (storageClass && storageClass !== "STANDARD") {
    out.StorageClass = storageClass as PutObjectCommandInput["StorageClass"];
  }
  const tagging = encodeTagging(tags);
  if (tagging) out.Tagging = tagging;
  return out;
}
