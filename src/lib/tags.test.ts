import { describe, test, expect } from "vitest";
import {
  validateTagSet,
  distinctTagValues,
  MAX_TAGS_PER_OBJECT,
} from "./tags";

describe("validateTagSet", () => {
  test("accepts a valid tag set", () => {
    expect(
      validateTagSet([
        { key: "env", value: "prod" },
        { key: "team", value: "" },
      ])
    ).toBeNull();
  });

  test("accepts an empty set", () => {
    expect(validateTagSet([])).toBeNull();
  });

  test("rejects more than 10 tags", () => {
    const tags = Array.from({ length: MAX_TAGS_PER_OBJECT + 1 }, (_, i) => ({
      key: `k${i}`,
      value: "v",
    }));
    expect(validateTagSet(tags)).toMatch(/max 10/);
  });

  test("rejects empty keys", () => {
    expect(validateTagSet([{ key: "", value: "v" }])).toMatch(/empty/i);
  });

  test("rejects keys over 128 characters", () => {
    expect(validateTagSet([{ key: "k".repeat(129), value: "v" }])).toMatch(/128/);
  });

  test("rejects values over 256 characters", () => {
    expect(validateTagSet([{ key: "k", value: "v".repeat(257) }])).toMatch(/256/);
  });

  test("rejects duplicate keys", () => {
    expect(
      validateTagSet([
        { key: "env", value: "a" },
        { key: "env", value: "b" },
      ])
    ).toMatch(/[Dd]uplicate/);
  });
});

describe("distinctTagValues", () => {
  test("dedupes and sorts values across keys", () => {
    expect(
      distinctTagValues({
        "a.txt": ["prod", "archive"],
        "b.txt": ["prod", "beta"],
      })
    ).toEqual(["archive", "beta", "prod"]);
  });

  test("returns empty array for empty map", () => {
    expect(distinctTagValues({})).toEqual([]);
  });
});
