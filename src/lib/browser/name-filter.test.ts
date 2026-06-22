import { describe, test, expect } from "vitest";
import { objectDisplayName, filterObjectsByName } from "./name-filter";

describe("objectDisplayName", () => {
  test("returns top-level file key unchanged", () => {
    expect(objectDisplayName("report.pdf")).toBe("report.pdf");
  });

  test("returns final segment of a nested file key", () => {
    expect(objectDisplayName("a/b/report.pdf")).toBe("report.pdf");
  });

  test("returns name without trailing slash for a folder key", () => {
    expect(objectDisplayName("a/photos/")).toBe("photos");
  });

  test("returns name without trailing slash for a root folder key", () => {
    expect(objectDisplayName("photos/")).toBe("photos");
  });
});

describe("filterObjectsByName", () => {
  const input = [
    { key: "report.pdf" },
    { key: "a/report.pdf" },
    { key: "a/photos/" },
    { key: "readme.txt" },
    { key: "data/archive.zip" },
  ];

  test("empty query returns the SAME array reference", () => {
    const result = filterObjectsByName(input, "");
    expect(result).toBe(input);
  });

  test("whitespace-only query returns the same array reference", () => {
    const result = filterObjectsByName(input, "   ");
    expect(result).toBe(input);
  });

  test("case-insensitive match on display name", () => {
    const result = filterObjectsByName(input, "REP");
    // matches "report.pdf" (root), "a/report.pdf" (nested, display name "report.pdf")
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.key)).toEqual(["report.pdf", "a/report.pdf"]);
  });

  test("substring match in the middle of the name", () => {
    const result = filterObjectsByName(input, "chive");
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("data/archive.zip");
  });

  test("folders matched by their display name", () => {
    const result = filterObjectsByName(input, "photos");
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("a/photos/");
  });

  test("non-matching query returns empty array", () => {
    const result = filterObjectsByName(input, "zzznomatch");
    expect(result).toEqual([]);
  });

  test("query matching only folder prefix does NOT match display name", () => {
    // key "a/report.pdf" has display name "report.pdf", not "a"
    // querying "a" should NOT match that key (display name doesn't contain "a" at start)
    // but "a" IS a substring of "report.pdf"? No — "report.pdf" does not contain "a".
    // Actually "readme.txt" contains no "a"; "archive.zip" contains "a".
    // Let's use a key where the folder prefix is "x" and the display name is "report.pdf"
    const objects = [{ key: "x/report.pdf" }];
    // query "x" should NOT match because display name is "report.pdf" (no "x")
    const result = filterObjectsByName(objects, "x");
    expect(result).toEqual([]);
  });

  test("only the display name is matched, not the full key", () => {
    // key "deeply/nested/file.txt" — display name is "file.txt"
    // querying "deeply" must NOT match
    const objects = [{ key: "deeply/nested/file.txt" }];
    const result = filterObjectsByName(objects, "deeply");
    expect(result).toEqual([]);
  });
});
