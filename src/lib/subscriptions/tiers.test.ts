import { describe, test, expect } from "vitest";
import { TIER_LIMITS, isUnlimited } from "./tiers";

describe("TIER_LIMITS", () => {
  test("FREE has 2 max connections", () => {
    expect(TIER_LIMITS.FREE.maxConnections).toBe(2);
  });

  test("FREE has 50MB upload limit", () => {
    expect(TIER_LIMITS.FREE.maxUploadSizeMB).toBe(50);
  });

  test("PRO has unlimited upload size", () => {
    expect(isUnlimited(TIER_LIMITS.PRO.maxUploadSizeMB)).toBe(true);
  });

  test("FREE shareLinks is false", () => {
    expect(TIER_LIMITS.FREE.shareLinks).toBe(false);
  });

  test("PRO shareLinks is true", () => {
    expect(TIER_LIMITS.PRO.shareLinks).toBe(true);
  });

  test("FREE teams disabled", () => {
    expect(TIER_LIMITS.FREE.teams.enabled).toBe(false);
  });

  test("PRO teams enabled with 1 team and 5 members", () => {
    expect(TIER_LIMITS.PRO.teams.enabled).toBe(true);
    expect(TIER_LIMITS.PRO.teams.maxTeams).toBe(1);
    expect(TIER_LIMITS.PRO.teams.maxMembersPerTeam).toBe(5);
  });

  test("FREE activity retention is 30 days", () => {
    expect(TIER_LIMITS.FREE.activityRetentionDays).toBe(30);
  });

  test("PRO activity retention is 90 days", () => {
    expect(TIER_LIMITS.PRO.activityRetentionDays).toBe(90);
  });

  test("ENTERPRISE activity retention is unlimited", () => {
    expect(isUnlimited(TIER_LIMITS.ENTERPRISE.activityRetentionDays)).toBe(true);
  });
});
