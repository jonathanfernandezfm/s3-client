// src/lib/s3/copy-fidelity.test.ts
import { describe, test, expect } from "vitest";
import { encodeTagging, buildFidelityParams, type SourceTag } from "./copy-fidelity";

describe("encodeTagging", () => {
  test("returns undefined for empty tag array", () => {
    expect(encodeTagging([])).toBeUndefined();
  });

  test("encodes tags as URL-encoded key=value pairs joined by &", () => {
    const tags: SourceTag[] = [
      { key: "a", value: "b c" },
      { key: "x", value: "y" },
    ];
    expect(encodeTagging(tags)).toBe("a=b%20c&x=y");
  });
});

describe("buildFidelityParams", () => {
  test("carries ContentType; omits empty Metadata and Tagging", () => {
    const result = buildFidelityParams(
      { ContentType: "image/png", Metadata: {} },
      []
    );
    expect(result).toEqual({ ContentType: "image/png" });
    expect("Metadata" in result).toBe(false);
    expect("Tagging" in result).toBe(false);
  });

  test("carries Metadata, Tagging, and non-STANDARD StorageClass", () => {
    const result = buildFidelityParams(
      { Metadata: { owner: "jo" } },
      [{ key: "env", value: "prod" }],
      "GLACIER"
    );
    expect(result.Metadata).toEqual({ owner: "jo" });
    expect(result.Tagging).toBe("env=prod");
    expect(result.StorageClass).toBe("GLACIER");
  });

  test("omits StorageClass when value is STANDARD", () => {
    const result = buildFidelityParams({}, [], "STANDARD");
    expect(result).toEqual({});
    expect("StorageClass" in result).toBe(false);
  });

  test("carries all system headers when present", () => {
    const result = buildFidelityParams(
      {
        ContentType: "text/html",
        CacheControl: "no-cache",
        ContentDisposition: 'attachment; filename="x.html"',
        ContentEncoding: "gzip",
        ContentLanguage: "en",
        Metadata: { author: "alice" },
      },
      []
    );
    expect(result.ContentType).toBe("text/html");
    expect(result.CacheControl).toBe("no-cache");
    expect(result.ContentDisposition).toBe('attachment; filename="x.html"');
    expect(result.ContentEncoding).toBe("gzip");
    expect(result.ContentLanguage).toBe("en");
    expect(result.Metadata).toEqual({ author: "alice" });
  });

  test("omits undefined system headers", () => {
    const result = buildFidelityParams({}, []);
    expect(result).toEqual({});
  });
});
