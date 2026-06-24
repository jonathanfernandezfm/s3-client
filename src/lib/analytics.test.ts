import { describe, it, expect } from "vitest";
import { isAnalyticsEnabled } from "./analytics";

describe("isAnalyticsEnabled", () => {
  it("returns false when NEXT_PUBLIC_POSTHOG_KEY is unset, even in production", () => {
    expect(
      isAnalyticsEnabled({ NODE_ENV: "production" })
    ).toBe(false);
  });

  it("returns false in development even when the key is set", () => {
    expect(
      isAnalyticsEnabled({
        NEXT_PUBLIC_POSTHOG_KEY: "phc_x",
        NODE_ENV: "development",
      })
    ).toBe(false);
  });

  it("returns false under test env with the key set", () => {
    expect(
      isAnalyticsEnabled({
        NEXT_PUBLIC_POSTHOG_KEY: "phc_x",
        NODE_ENV: "test",
      })
    ).toBe(false);
  });

  it("returns true in production with the key set", () => {
    expect(
      isAnalyticsEnabled({
        NEXT_PUBLIC_POSTHOG_KEY: "phc_x",
        NODE_ENV: "production",
      })
    ).toBe(true);
  });

  it("returns true when NEXT_PUBLIC_POSTHOG_FORCE_ENABLE=true even in development", () => {
    expect(
      isAnalyticsEnabled({
        NEXT_PUBLIC_POSTHOG_KEY: "phc_x",
        NODE_ENV: "development",
        NEXT_PUBLIC_POSTHOG_FORCE_ENABLE: "true",
      })
    ).toBe(true);
  });

  it("returns false when the force flag is set but the key is absent", () => {
    expect(
      isAnalyticsEnabled({
        NODE_ENV: "development",
        NEXT_PUBLIC_POSTHOG_FORCE_ENABLE: "true",
      })
    ).toBe(false);
  });
});
