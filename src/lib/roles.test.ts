import { describe, it, expect } from "vitest";
import { canManageFiles, canManageConnections } from "./roles";

describe("canManageFiles", () => {
  it("allows ADMIN and EDITOR", () => {
    expect(canManageFiles("ADMIN")).toBe(true);
    expect(canManageFiles("EDITOR")).toBe(true);
  });

  it("denies VIEWER and null", () => {
    expect(canManageFiles("VIEWER")).toBe(false);
    expect(canManageFiles(null)).toBe(false);
  });
});

describe("canManageConnections", () => {
  it("allows only ADMIN", () => {
    expect(canManageConnections("ADMIN")).toBe(true);
    expect(canManageConnections("EDITOR")).toBe(false);
    expect(canManageConnections("VIEWER")).toBe(false);
    expect(canManageConnections(null)).toBe(false);
  });
});
