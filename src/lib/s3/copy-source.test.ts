import { describe, test, expect } from "vitest";
import { buildCopySource } from "./copy-source";

describe("buildCopySource", () => {
  test("encodes the key but keeps the bucket/key separator literal", () => {
    expect(buildCopySource("my-bucket", "file.txt")).toBe("my-bucket/file.txt");
  });

  test("encodes in-key slashes for nested keys", () => {
    expect(buildCopySource("my-bucket", "docs/sub/file.txt")).toBe(
      "my-bucket/docs%2Fsub%2Ffile.txt"
    );
  });

  test("encodes spaces and special characters in the key", () => {
    expect(buildCopySource("b", "a b+c&d.txt")).toBe("b/a%20b%2Bc%26d.txt");
  });

  test("appends an encoded versionId when provided", () => {
    expect(buildCopySource("b", "k/v.txt", "abc 123")).toBe(
      "b/k%2Fv.txt?versionId=abc%20123"
    );
  });

  test("matches the form the versioned routes were already using", () => {
    const bucket = "b";
    const key = "docs/file.txt";
    const versionId = "v1";
    expect(buildCopySource(bucket, key, versionId)).toBe(
      `${bucket}/${encodeURIComponent(key)}?versionId=${encodeURIComponent(versionId)}`
    );
  });
});
