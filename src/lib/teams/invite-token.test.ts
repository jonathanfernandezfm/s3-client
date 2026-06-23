import { describe, test, expect } from "vitest";
import { generateInviteToken, INVITE_TOKEN_LENGTH } from "./invite-token";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

describe("generateInviteToken", () => {
  test("produces a string of INVITE_TOKEN_LENGTH characters", () => {
    expect(generateInviteToken()).toHaveLength(INVITE_TOKEN_LENGTH);
  });

  test("only contains base62 characters", () => {
    const re = new RegExp(`^[${ALPHABET}]+$`);
    for (let i = 0; i < 100; i++) {
      expect(generateInviteToken()).toMatch(re);
    }
  });

  test("returns different tokens across calls (uniqueness sanity)", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateInviteToken()));
    expect(tokens.size).toBe(1000);
  });
});
