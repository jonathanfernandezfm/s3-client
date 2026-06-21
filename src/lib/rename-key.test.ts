import { describe, test, expect } from "vitest";
import { computeRenameTarget, basename } from "./rename-key";

describe("computeRenameTarget", () => {
  test("renames nested file correctly", () => {
    const result = computeRenameTarget("a/b/old.txt", "new.txt");
    expect(result).toEqual({ ok: true, targetKey: "a/b/new.txt" });
  });

  test("renames top-level file (no parent path)", () => {
    const result = computeRenameTarget("old.txt", "new.txt");
    expect(result).toEqual({ ok: true, targetKey: "new.txt" });
  });

  test("returns error for empty name", () => {
    const result = computeRenameTarget("a/old.txt", "");
    expect(result).toEqual({ ok: false, error: "Name cannot be empty" });
  });

  test("returns error for name with whitespace only", () => {
    const result = computeRenameTarget("a/old.txt", "   ");
    expect(result).toEqual({ ok: false, error: "Name cannot be empty" });
  });

  test("returns error for name containing slash", () => {
    const result = computeRenameTarget("a/old.txt", "sub/new.txt");
    expect(result).toEqual({ ok: false, error: "Name cannot contain '/'" });
  });

  test("returns error when name is unchanged", () => {
    const result = computeRenameTarget("a/b/same.txt", "same.txt");
    expect(result).toEqual({ ok: false, error: "unchanged" });
  });

  test("trims whitespace around the new name", () => {
    const result = computeRenameTarget("a/old.txt", "  new.txt  ");
    expect(result).toEqual({ ok: true, targetKey: "a/new.txt" });
  });
});

describe("basename", () => {
  test("extracts basename from nested path", () => {
    expect(basename("a/b/c.png")).toBe("c.png");
  });

  test("returns key unchanged when no slash", () => {
    expect(basename("c.png")).toBe("c.png");
  });
});
