import { describe, test, expect } from "vitest";
import { resolveBucketTab, isBucketTabKey } from "./bucket-tab-key";

describe("resolveBucketTab", () => {
  test("resolves 'incomplete-uploads' alias to 'multipart'", () => {
    expect(resolveBucketTab("incomplete-uploads")).toBe("multipart");
  });

  test("passes through the 'multipart' key directly", () => {
    expect(resolveBucketTab("multipart")).toBe("multipart");
  });

  test("passes through the 'permissions' key directly", () => {
    expect(resolveBucketTab("permissions")).toBe("permissions");
  });

  test("returns 'overview' for null", () => {
    expect(resolveBucketTab(null)).toBe("overview");
  });

  test("returns 'overview' for an unrecognized slug", () => {
    expect(resolveBucketTab("bogus")).toBe("overview");
  });
});

describe("isBucketTabKey", () => {
  test("returns true for a valid tab key", () => {
    expect(isBucketTabKey("overview")).toBe(true);
  });

  test("returns false for an alias (not a raw key)", () => {
    expect(isBucketTabKey("incomplete-uploads")).toBe(false);
  });
});
