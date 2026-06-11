import { describe, test, expect } from "vitest";
import { canPerformVersionAction, type VersionAction } from "./permissions";

const actions: VersionAction[] = [
  "list",
  "presign",
  "restore",
  "undelete",
  "copy",
  "purge",
  "bucket_toggle",
];

describe("canPerformVersionAction", () => {
  test("ADMIN can perform every action", () => {
    for (const action of actions) {
      expect(canPerformVersionAction("ADMIN", action)).toBe(true);
    }
  });

  test("VIEWER cannot perform any version action (read also gated since the feature is write-leaning)", () => {
    expect(canPerformVersionAction("VIEWER", "list")).toBe(true);
    expect(canPerformVersionAction("VIEWER", "presign")).toBe(true);
    expect(canPerformVersionAction("VIEWER", "restore")).toBe(false);
    expect(canPerformVersionAction("VIEWER", "undelete")).toBe(false);
    expect(canPerformVersionAction("VIEWER", "copy")).toBe(false);
    expect(canPerformVersionAction("VIEWER", "purge")).toBe(false);
    expect(canPerformVersionAction("VIEWER", "bucket_toggle")).toBe(false);
  });

  test("null role denies everything (treat unknown as no access)", () => {
    for (const action of actions) {
      expect(canPerformVersionAction(null, action)).toBe(false);
    }
  });

  test("EDITOR can perform write-level actions but not admin-only actions", () => {
    expect(canPerformVersionAction("EDITOR", "list")).toBe(true);
    expect(canPerformVersionAction("EDITOR", "presign")).toBe(true);
    expect(canPerformVersionAction("EDITOR", "restore")).toBe(true);
    expect(canPerformVersionAction("EDITOR", "undelete")).toBe(true);
    expect(canPerformVersionAction("EDITOR", "copy")).toBe(true);
    expect(canPerformVersionAction("EDITOR", "purge")).toBe(false);
    expect(canPerformVersionAction("EDITOR", "bucket_toggle")).toBe(false);
  });
});
