import { describe, test, expect } from "vitest";
import { canCopyShare, canExtendShare, canRevokeShare } from "./row-actions";

describe("canCopyShare", () => {
  test("returns true for active", () => {
    expect(canCopyShare("active")).toBe(true);
  });

  test("returns false for expired", () => {
    expect(canCopyShare("expired")).toBe(false);
  });

  test("returns false for exhausted", () => {
    expect(canCopyShare("exhausted")).toBe(false);
  });

  test("returns false for revoked", () => {
    expect(canCopyShare("revoked")).toBe(false);
  });
});

describe("canExtendShare", () => {
  test("returns true for active", () => {
    expect(canExtendShare("active")).toBe(true);
  });

  test("returns true for expired", () => {
    expect(canExtendShare("expired")).toBe(true);
  });

  test("returns false for exhausted", () => {
    expect(canExtendShare("exhausted")).toBe(false);
  });

  test("returns false for revoked", () => {
    expect(canExtendShare("revoked")).toBe(false);
  });
});

describe("canRevokeShare", () => {
  test("returns true for active", () => {
    expect(canRevokeShare("active")).toBe(true);
  });

  test("returns false for expired", () => {
    expect(canRevokeShare("expired")).toBe(false);
  });

  test("returns false for exhausted", () => {
    expect(canRevokeShare("exhausted")).toBe(false);
  });

  test("returns false for revoked", () => {
    expect(canRevokeShare("revoked")).toBe(false);
  });
});
