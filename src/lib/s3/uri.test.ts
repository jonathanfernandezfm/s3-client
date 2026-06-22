import { describe, it, expect } from "vitest";
import { s3Uri, objectHttpUrl } from "./uri";

describe("s3Uri", () => {
  it("builds an s3:// uri with the full key", () => {
    expect(s3Uri("my-bucket", "a/b/c.png")).toBe("s3://my-bucket/a/b/c.png");
  });
});

describe("objectHttpUrl", () => {
  it("uses path style and strips a trailing slash on the endpoint", () => {
    expect(objectHttpUrl("https://minio.example.com/", "b", "k/x.png", true))
      .toBe("https://minio.example.com/b/k/x.png");
  });
  it("uses virtual-hosted style when forcePathStyle is false", () => {
    expect(objectHttpUrl("https://s3.amazonaws.com", "b", "k/x.png", false))
      .toBe("https://b.s3.amazonaws.com/k/x.png");
  });
  it("encodes special characters per segment but keeps slashes", () => {
    expect(objectHttpUrl("https://h", "b", "a b/c+d.png", true))
      .toBe("https://h/b/a%20b/c%2Bd.png");
  });
});
