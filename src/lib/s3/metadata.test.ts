// src/lib/s3/metadata.test.ts
import { describe, test, expect } from "vitest";
import type { HeadObjectCommandOutput } from "@aws-sdk/client-s3";
import {
  buildMetadataCopyParams,
  MetadataEditError,
  MAX_COPY_SIZE,
  type MetadataEdits,
} from "./metadata";

function head(overrides: Partial<HeadObjectCommandOutput> = {}): HeadObjectCommandOutput {
  return { $metadata: {}, ContentLength: 1024, ...overrides };
}

function edits(overrides: Partial<MetadataEdits> = {}): MetadataEdits {
  return {
    contentType: "text/plain",
    cacheControl: "",
    metadata: {},
    storageClass: "STANDARD",
    ...overrides,
  };
}

describe("buildMetadataCopyParams", () => {
  test("applies edited fields and targets the same key", () => {
    const params = buildMetadataCopyParams("my-bucket", "docs/file.txt", head(), edits({
      contentType: "application/json",
      cacheControl: "public, max-age=3600",
      metadata: { owner: "alice" },
      storageClass: "STANDARD_IA",
    }));

    expect(params.Bucket).toBe("my-bucket");
    expect(params.Key).toBe("docs/file.txt");
    expect(params.CopySource).toBe("my-bucket/docs%2Ffile.txt");
    expect(params.MetadataDirective).toBe("REPLACE");
    expect(params.ContentType).toBe("application/json");
    expect(params.CacheControl).toBe("public, max-age=3600");
    expect(params.Metadata).toEqual({ owner: "alice" });
    expect(params.StorageClass).toBe("STANDARD_IA");
  });

  test("omits blank ContentType and CacheControl instead of sending empty strings", () => {
    const params = buildMetadataCopyParams("b", "k", head(), edits({
      contentType: "  ",
      cacheControl: "",
    }));
    expect("ContentType" in params).toBe(false);
    expect("CacheControl" in params).toBe(false);
  });

  test("defaults blank storage class to STANDARD", () => {
    const params = buildMetadataCopyParams("b", "k", head(), edits({ storageClass: " " }));
    expect(params.StorageClass).toBe("STANDARD");
  });

  test("preserves unedited headers from head", () => {
    const params = buildMetadataCopyParams("b", "k", head({
      ContentDisposition: 'attachment; filename="x.txt"',
      ContentEncoding: "gzip",
      ContentLanguage: "en",
      Expires: new Date("2030-01-01T00:00:00Z"),
    }), edits());
    expect(params.ContentDisposition).toBe('attachment; filename="x.txt"');
    expect(params.ContentEncoding).toBe("gzip");
    expect(params.ContentLanguage).toBe("en");
    expect(params.Expires).toEqual(new Date("2030-01-01T00:00:00Z"));
  });

  test("re-applies SSE-S3 without a KMS key id", () => {
    const params = buildMetadataCopyParams("b", "k", head({
      ServerSideEncryption: "AES256",
    }), edits());
    expect(params.ServerSideEncryption).toBe("AES256");
    expect("SSEKMSKeyId" in params).toBe(false);
  });

  test("re-applies SSE-KMS including the key id", () => {
    const params = buildMetadataCopyParams("b", "k", head({
      ServerSideEncryption: "aws:kms",
      SSEKMSKeyId: "arn:aws:kms:eu-west-1:123:key/abc",
    }), edits());
    expect(params.ServerSideEncryption).toBe("aws:kms");
    expect(params.SSEKMSKeyId).toBe("arn:aws:kms:eu-west-1:123:key/abc");
  });

  test("lowercases and trims metadata keys, skips empty keys", () => {
    const params = buildMetadataCopyParams("b", "k", head(), edits({
      metadata: { " Owner ": "alice", "": "ignored" },
    }));
    expect(params.Metadata).toEqual({ owner: "alice" });
  });

  test("rejects invalid metadata keys", () => {
    expect(() =>
      buildMetadataCopyParams("b", "k", head(), edits({ metadata: { "bad key!": "v" } }))
    ).toThrow(MetadataEditError);
  });

  test("rejects non-ASCII metadata values", () => {
    expect(() =>
      buildMetadataCopyParams("b", "k", head(), edits({ metadata: { owner: "ålice" } }))
    ).toThrow(MetadataEditError);
  });

  test("rejects folder keys", () => {
    expect(() =>
      buildMetadataCopyParams("b", "folder/", head(), edits())
    ).toThrow(MetadataEditError);
  });

  test("rejects objects larger than the single-part copy limit", () => {
    expect(() =>
      buildMetadataCopyParams("b", "k", head({ ContentLength: MAX_COPY_SIZE + 1 }), edits())
    ).toThrow(MetadataEditError);
  });

  test("rejects archived objects that are not restored", () => {
    expect(() =>
      buildMetadataCopyParams("b", "k", head({ StorageClass: "GLACIER" }), edits())
    ).toThrow(MetadataEditError);
    expect(() =>
      buildMetadataCopyParams("b", "k", head({ StorageClass: "DEEP_ARCHIVE" }), edits())
    ).toThrow(MetadataEditError);
  });

  test("allows archived objects with a completed restore", () => {
    const params = buildMetadataCopyParams("b", "k", head({
      StorageClass: "GLACIER",
      Restore: 'ongoing-request="false", expiry-date="Fri, 21 Dec 2026 00:00:00 GMT"',
    }), edits({ storageClass: "STANDARD" }));
    expect(params.StorageClass).toBe("STANDARD");
  });
});
