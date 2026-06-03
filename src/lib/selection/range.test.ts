import { describe, test, expect } from "vitest";
import { computeRangeKeys } from "./range";

describe("computeRangeKeys", () => {
  const keys = ["a", "b", "c", "d", "e"];

  test("returns [target] when anchor is null", () => {
    expect(computeRangeKeys(keys, null, "c")).toEqual(["c"]);
  });

  test("returns [target] when anchor is not in the ordered list", () => {
    expect(computeRangeKeys(keys, "z", "c")).toEqual(["c"]);
  });

  test("returns [target] when target is not in the ordered list", () => {
    expect(computeRangeKeys(keys, "a", "z")).toEqual(["z"]);
  });

  test("returns [key] when anchor equals target", () => {
    expect(computeRangeKeys(keys, "c", "c")).toEqual(["c"]);
  });

  test("returns inclusive forward range when anchor is before target", () => {
    expect(computeRangeKeys(keys, "b", "d")).toEqual(["b", "c", "d"]);
  });

  test("returns inclusive backward range when anchor is after target", () => {
    expect(computeRangeKeys(keys, "d", "b")).toEqual(["b", "c", "d"]);
  });

  test("returns full list when anchor is first and target is last", () => {
    expect(computeRangeKeys(keys, "a", "e")).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("returns [target] when the ordered list is empty", () => {
    expect(computeRangeKeys([], "a", "b")).toEqual(["b"]);
  });
});
