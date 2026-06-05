import { describe, test, expect } from "vitest";
import { normalizeVersions } from "./normalize";

describe("normalizeVersions", () => {
  test("returns empty array when SDK returned no Versions and no DeleteMarkers", () => {
    expect(normalizeVersions({})).toEqual([]);
  });

  test("converts a Versions entry into an S3ObjectVersion with isDeleteMarker=false", () => {
    const lastModified = new Date("2026-06-01T10:00:00.000Z");
    const result = normalizeVersions({
      Versions: [
        {
          Key: "a.txt",
          VersionId: "v1",
          IsLatest: true,
          LastModified: lastModified,
          Size: 100,
          ETag: '"abc"',
          StorageClass: "STANDARD",
        },
      ],
    });
    expect(result).toEqual([
      {
        key: "a.txt",
        versionId: "v1",
        isLatest: true,
        isDeleteMarker: false,
        lastModified,
        size: 100,
        etag: '"abc"',
        storageClass: "STANDARD",
      },
    ]);
  });

  test("converts a DeleteMarkers entry into an S3ObjectVersion with isDeleteMarker=true and no size", () => {
    const lastModified = new Date("2026-06-02T10:00:00.000Z");
    const result = normalizeVersions({
      DeleteMarkers: [
        { Key: "a.txt", VersionId: "dm1", IsLatest: true, LastModified: lastModified },
      ],
    });
    expect(result).toEqual([
      {
        key: "a.txt",
        versionId: "dm1",
        isLatest: true,
        isDeleteMarker: true,
        lastModified,
        size: undefined,
        etag: undefined,
        storageClass: undefined,
      },
    ]);
  });

  test("groups by key, with each key's entries sorted descending by lastModified", () => {
    const result = normalizeVersions({
      Versions: [
        { Key: "b.txt", VersionId: "b1", IsLatest: true, LastModified: new Date("2026-06-03"), Size: 1 },
        { Key: "a.txt", VersionId: "a2", IsLatest: true, LastModified: new Date("2026-06-02"), Size: 2 },
        { Key: "a.txt", VersionId: "a1", IsLatest: false, LastModified: new Date("2026-06-01"), Size: 1 },
      ],
    });
    expect(result.map((v) => v.versionId)).toEqual(["a2", "a1", "b1"]);
  });

  test("merges Versions and DeleteMarkers for the same key into one chronological group", () => {
    const result = normalizeVersions({
      Versions: [
        { Key: "a.txt", VersionId: "a1", IsLatest: false, LastModified: new Date("2026-06-01"), Size: 1 },
        { Key: "a.txt", VersionId: "a2", IsLatest: false, LastModified: new Date("2026-06-03"), Size: 2 },
      ],
      DeleteMarkers: [
        { Key: "a.txt", VersionId: "dm1", IsLatest: true, LastModified: new Date("2026-06-04") },
      ],
    });
    expect(result.map((v) => v.versionId)).toEqual(["dm1", "a2", "a1"]);
    expect(result[0].isDeleteMarker).toBe(true);
    expect(result[1].isDeleteMarker).toBe(false);
  });

  test("groups by key in alphabetical order when keys differ", () => {
    const result = normalizeVersions({
      Versions: [
        { Key: "c.txt", VersionId: "c1", IsLatest: true, LastModified: new Date("2026-06-03"), Size: 1 },
        { Key: "a.txt", VersionId: "a1", IsLatest: true, LastModified: new Date("2026-06-01"), Size: 1 },
        { Key: "b.txt", VersionId: "b1", IsLatest: true, LastModified: new Date("2026-06-02"), Size: 1 },
      ],
    });
    expect(result.map((v) => v.key)).toEqual(["a.txt", "b.txt", "c.txt"]);
  });

  test('preserves versionId "null" returned for non-versioned listings', () => {
    const result = normalizeVersions({
      Versions: [
        { Key: "a.txt", VersionId: "null", IsLatest: true, LastModified: new Date("2026-06-01"), Size: 1 },
      ],
    });
    expect(result[0].versionId).toBe("null");
  });

  test("omits an entry that has no Key or no VersionId (defensive)", () => {
    const result = normalizeVersions({
      Versions: [
        { Key: undefined, VersionId: "v1", IsLatest: true, LastModified: new Date(), Size: 1 },
        { Key: "a.txt", VersionId: undefined, IsLatest: true, LastModified: new Date(), Size: 1 },
      ],
    });
    expect(result).toEqual([]);
  });

  test("includes owner when present", () => {
    const result = normalizeVersions({
      Versions: [
        {
          Key: "a.txt",
          VersionId: "v1",
          IsLatest: true,
          LastModified: new Date("2026-06-01"),
          Size: 1,
          Owner: { ID: "user-1", DisplayName: "Alice" },
        },
      ],
    });
    expect(result[0].owner).toEqual({ id: "user-1", displayName: "Alice" });
  });
});
