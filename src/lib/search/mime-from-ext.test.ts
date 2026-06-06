import { describe, test, expect } from "vitest";
import { mimeFromExt, extOf } from "./mime-from-ext";

describe("extOf", () => {
  test("extracts simple extension", () => {
    expect(extOf("logo.png")).toBe("png");
  });
  test("handles paths", () => {
    expect(extOf("a/b/c/file.PDF")).toBe("pdf");
  });
  test("detects compound .tar.gz", () => {
    expect(extOf("backup.tar.gz")).toBe("tar.gz");
  });
  test("returns null when no dot", () => {
    expect(extOf("README")).toBeNull();
  });
  test("ignores trailing dot", () => {
    expect(extOf("name.")).toBeNull();
  });
  test("ignores hidden-file leading dot", () => {
    expect(extOf(".gitignore")).toBeNull();
  });
});

describe("mimeFromExt", () => {
  test("known: png", () => {
    expect(mimeFromExt("png")).toBe("image/png");
  });
  test("known: jpg and jpeg map to the same mime", () => {
    expect(mimeFromExt("jpg")).toBe("image/jpeg");
    expect(mimeFromExt("jpeg")).toBe("image/jpeg");
  });
  test("compound: tar.gz", () => {
    expect(mimeFromExt("tar.gz")).toBe("application/gzip");
  });
  test("case-insensitive", () => {
    expect(mimeFromExt("PDF")).toBe("application/pdf");
  });
  test("unknown returns null", () => {
    expect(mimeFromExt("xyzzy")).toBeNull();
  });
  test("null extension returns null", () => {
    expect(mimeFromExt(null)).toBeNull();
  });
});
