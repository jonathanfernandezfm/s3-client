import { describe, test, expect } from "vitest";
import { canDiff, DIFF_MAX_BYTES } from "./can-diff";

const v = (overrides: Partial<Parameters<typeof canDiff>[0][number]> = {}) => ({
  key: "a.txt",
  versionId: "v1",
  isDeleteMarker: false,
  size: 100,
  contentType: "text/plain",
  ...overrides,
});

describe("canDiff", () => {
  test("returns false when fewer than 2 selections", () => {
    expect(canDiff([])).toEqual({ ok: false, reason: "wrongCount" });
    expect(canDiff([v()])).toEqual({ ok: false, reason: "wrongCount" });
  });

  test("returns false when more than 2 selections", () => {
    expect(canDiff([v(), v(), v()])).toEqual({ ok: false, reason: "wrongCount" });
  });

  test("returns true for two text/plain entries under the size cap", () => {
    expect(canDiff([v({ versionId: "a", size: 10 }), v({ versionId: "b", size: 20 })])).toEqual({
      ok: true,
    });
  });

  test("returns false when either selection is a delete marker", () => {
    expect(canDiff([v({ versionId: "a" }), v({ versionId: "b", isDeleteMarker: true })])).toEqual({
      ok: false,
      reason: "deleteMarker",
    });
  });

  test(`returns false when either size exceeds ${DIFF_MAX_BYTES} bytes`, () => {
    expect(
      canDiff([
        v({ versionId: "a", size: DIFF_MAX_BYTES + 1 }),
        v({ versionId: "b", size: 100 }),
      ]),
    ).toEqual({ ok: false, reason: "tooLarge" });
  });

  test("returns false for binary content types", () => {
    expect(
      canDiff([
        v({ versionId: "a", contentType: "application/octet-stream" }),
        v({ versionId: "b", contentType: "text/plain" }),
      ]),
    ).toEqual({ ok: false, reason: "binary" });
  });

  test("returns true when content-type is missing but extension is text-like", () => {
    expect(
      canDiff([
        v({ versionId: "a", key: "config.yaml", contentType: undefined }),
        v({ versionId: "b", key: "config.yaml", contentType: undefined }),
      ]),
    ).toEqual({ ok: true });
  });

  test("returns false when content-type is missing and extension is unknown", () => {
    expect(
      canDiff([
        v({ versionId: "a", key: "blob.xyz", contentType: undefined }),
        v({ versionId: "b", key: "blob.xyz", contentType: undefined }),
      ]),
    ).toEqual({ ok: false, reason: "binary" });
  });

  test("treats text/* content types as text", () => {
    expect(
      canDiff([
        v({ versionId: "a", contentType: "text/html" }),
        v({ versionId: "b", contentType: "text/markdown" }),
      ]),
    ).toEqual({ ok: true });
  });
});
