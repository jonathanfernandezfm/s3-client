import { describe, it, expect } from "vitest";
import robots from "./robots";

describe("robots", () => {
  it("disallows private routes and references the sitemap", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    const disallow = ([] as string[]).concat(rules.disallow ?? []);
    expect(disallow).toEqual(
      expect.arrayContaining(["/app/", "/sign-in", "/sign-up", "/s/"])
    );
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("allows the root path", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules.allow).toBe("/");
  });
});
