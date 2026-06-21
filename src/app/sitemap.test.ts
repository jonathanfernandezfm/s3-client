import { describe, it, expect } from "vitest";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("returns exactly one entry", () => {
    const result = sitemap();
    expect(result).toHaveLength(1);
  });

  it("has a url ending with / and priority of 1", () => {
    const result = sitemap();
    expect(result[0].url).toMatch(/\/$/);
    expect(result[0].priority).toBe(1);
  });
});
