import { describe, test, expect } from "vitest";
import {
  getPathTail,
  isBookmarked,
  findBookmark,
  getBucketBookmarks,
  getPrefixBookmarks,
  reorderBucketPins,
  type BookmarkResponse,
} from "./bookmarks-helpers";

const bookmark = (overrides: Partial<BookmarkResponse> = {}): BookmarkResponse => ({
  id: "bm-1",
  connectionId: "conn-1",
  connectionName: "My S3",
  bucket: "media-prod",
  prefix: null,
  label: null,
  createdAt: "2026-06-03T00:00:00.000Z",
  ...overrides,
});

describe("getPathTail", () => {
  test("returns last non-empty segment of a prefix with trailing slash", () => {
    expect(getPathTail("processed/2024/Q4/")).toBe("Q4");
  });

  test("returns folder name for single-level prefix with trailing slash", () => {
    expect(getPathTail("incoming/")).toBe("incoming");
  });

  test("returns folder name for single-level prefix without trailing slash", () => {
    expect(getPathTail("incoming")).toBe("incoming");
  });

  test("handles deeply nested prefix", () => {
    expect(getPathTail("a/b/c/d/e/")).toBe("e");
  });

  test("returns empty string for empty input", () => {
    expect(getPathTail("")).toBe("");
  });
});

describe("isBookmarked", () => {
  test("returns true when bucket-level bookmark matches", () => {
    const bookmarks = [bookmark({ connectionId: "conn-1", bucket: "media-prod", prefix: null })];
    expect(isBookmarked(bookmarks, "conn-1", "media-prod", null)).toBe(true);
  });

  test("returns true when prefix bookmark matches", () => {
    const bookmarks = [
      bookmark({ connectionId: "conn-1", bucket: "media-prod", prefix: "processed/2024/Q4/" }),
    ];
    expect(isBookmarked(bookmarks, "conn-1", "media-prod", "processed/2024/Q4/")).toBe(true);
  });

  test("returns false when connectionId does not match", () => {
    const bookmarks = [bookmark({ connectionId: "conn-1", bucket: "media-prod", prefix: null })];
    expect(isBookmarked(bookmarks, "conn-2", "media-prod", null)).toBe(false);
  });

  test("returns false when bucket does not match", () => {
    const bookmarks = [bookmark({ connectionId: "conn-1", bucket: "media-prod", prefix: null })];
    expect(isBookmarked(bookmarks, "conn-1", "other-bucket", null)).toBe(false);
  });

  test("returns false when prefix does not match", () => {
    const bookmarks = [
      bookmark({ connectionId: "conn-1", bucket: "media-prod", prefix: "foo/" }),
    ];
    expect(isBookmarked(bookmarks, "conn-1", "media-prod", "bar/")).toBe(false);
  });

  test("returns false for empty bookmarks list", () => {
    expect(isBookmarked([], "conn-1", "media-prod", null)).toBe(false);
  });

  test("distinguishes bucket pin (null) from prefix pin (non-null)", () => {
    const bookmarks = [
      bookmark({ connectionId: "conn-1", bucket: "media-prod", prefix: null }),
    ];
    expect(isBookmarked(bookmarks, "conn-1", "media-prod", "some/path/")).toBe(false);
  });
});

describe("findBookmark", () => {
  test("returns the matching bookmark", () => {
    const bm = bookmark({ id: "bm-42", connectionId: "conn-1", bucket: "media-prod", prefix: null });
    expect(findBookmark([bm], "conn-1", "media-prod", null)?.id).toBe("bm-42");
  });

  test("returns undefined when no match", () => {
    expect(findBookmark([], "conn-1", "media-prod", null)).toBeUndefined();
  });
});

describe("getBucketBookmarks", () => {
  test("returns only bucket-level bookmarks (prefix === null) for the connection", () => {
    const bookmarks = [
      bookmark({ id: "b1", connectionId: "conn-1", bucket: "bucket-a", prefix: null }),
      bookmark({ id: "b2", connectionId: "conn-1", bucket: "bucket-b", prefix: "folder/" }),
      bookmark({ id: "b3", connectionId: "conn-2", bucket: "bucket-a", prefix: null }),
    ];
    const result = getBucketBookmarks(bookmarks, "conn-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b1");
  });

  test("returns empty array when no bucket-level pins exist for the connection", () => {
    const bookmarks = [
      bookmark({ connectionId: "conn-1", bucket: "bucket-a", prefix: "folder/" }),
    ];
    expect(getBucketBookmarks(bookmarks, "conn-1")).toHaveLength(0);
  });
});

describe("getPrefixBookmarks", () => {
  test("returns only prefix bookmarks for the given connection and bucket", () => {
    const bookmarks = [
      bookmark({ id: "p1", connectionId: "conn-1", bucket: "media-prod", prefix: "processed/" }),
      bookmark({ id: "p2", connectionId: "conn-1", bucket: "media-prod", prefix: "raw/" }),
      bookmark({ id: "p3", connectionId: "conn-1", bucket: "other-bucket", prefix: "stuff/" }),
      bookmark({ id: "p4", connectionId: "conn-1", bucket: "media-prod", prefix: null }),
    ];
    const result = getPrefixBookmarks(bookmarks, "conn-1", "media-prod");
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.id)).toEqual(["p1", "p2"]);
  });

  test("returns empty array when no prefix pins exist for the bucket", () => {
    const bookmarks = [
      bookmark({ connectionId: "conn-1", bucket: "media-prod", prefix: null }),
    ];
    expect(getPrefixBookmarks(bookmarks, "conn-1", "media-prod")).toHaveLength(0);
  });
});

describe("reorderBucketPins", () => {
  test("reorders bucket pins to match the provided ID order", () => {
    const bookmarks = [
      bookmark({ id: "b1", prefix: null }),
      bookmark({ id: "b2", prefix: null }),
      bookmark({ id: "b3", prefix: null }),
    ];
    const result = reorderBucketPins(bookmarks, ["b3", "b1", "b2"]);
    expect(result.map((b) => b.id)).toEqual(["b3", "b1", "b2"]);
  });

  test("places prefix bookmarks after bucket pins", () => {
    const bookmarks = [
      bookmark({ id: "b1", prefix: null }),
      bookmark({ id: "p1", prefix: "folder/" }),
      bookmark({ id: "b2", prefix: null }),
    ];
    const result = reorderBucketPins(bookmarks, ["b2", "b1"]);
    expect(result.map((b) => b.id)).toEqual(["b2", "b1", "p1"]);
  });

  test("preserves relative order of prefix bookmarks", () => {
    const bookmarks = [
      bookmark({ id: "b1", prefix: null }),
      bookmark({ id: "p1", prefix: "alpha/" }),
      bookmark({ id: "p2", prefix: "beta/" }),
    ];
    const result = reorderBucketPins(bookmarks, ["b1"]);
    expect(result.map((b) => b.id)).toEqual(["b1", "p1", "p2"]);
  });
});
