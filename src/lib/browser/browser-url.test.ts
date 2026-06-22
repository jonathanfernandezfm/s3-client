import { describe, expect, it } from "vitest";
import { browserRouteHref, parentPrefix } from "./browser-url";

describe("browserRouteHref", () => {
  it("builds an encoded app browser route for a folder prefix", () => {
    expect(
      browserRouteHref({
        connectionId: "8fc0c830-15fa-4363-8d85-954035f775c2",
        bucket: "reports bucket",
        path: "exports/2026 Q2/",
      })
    ).toBe(
      "/app/browser/8fc0c830-15fa-4363-8d85-954035f775c2/reports%20bucket/exports/2026%20Q2"
    );
  });
});

describe("parentPrefix", () => {
  it("returns the containing folder prefix for an object key", () => {
    expect(parentPrefix("exports/2026/report.csv")).toBe("exports/2026/");
  });

  it("keeps folder keys as the selected prefix", () => {
    expect(parentPrefix("exports/2026/")).toBe("exports/2026/");
  });
});
