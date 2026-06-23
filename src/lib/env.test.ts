import { describe, it, expect } from "vitest";
import { validateEnv } from "./env";

// A complete, valid env object that should pass all checks.
const VALID_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc123",
  CLERK_SECRET_KEY: "sk_test_abc123",
  CLERK_WEBHOOK_SECRET: "whsec_abc123",
  ENCRYPTION_KEY: "a".repeat(64), // 64 valid hex chars
  SHARE_LINK_COOKIE_SECRET: "b".repeat(64), // 64 valid hex chars
  STRIPE_SECRET_KEY: "sk_test_stripe123",
  STRIPE_WEBHOOK_SECRET: "whsec_stripe123",
  STRIPE_PRO_PRICE_ID: "price_abc123",
};

describe("validateEnv", () => {
  it("passes with a complete, valid env object", () => {
    expect(() => validateEnv(VALID_ENV)).not.toThrow();
  });

  it("throws when DATABASE_URL is missing and the message contains DATABASE_URL", () => {
    const env = { ...VALID_ENV, DATABASE_URL: undefined };
    expect(() => validateEnv(env)).toThrow(/DATABASE_URL/);
  });

  it("throws when ENCRYPTION_KEY is present but not 64 hex chars", () => {
    const env = { ...VALID_ENV, ENCRYPTION_KEY: "tooshort" };
    expect(() => validateEnv(env)).toThrow(
      /ENCRYPTION_KEY must be a 64-character hex string/
    );
  });

  it("aggregates: with two vars missing, the message contains both names", () => {
    const env = {
      ...VALID_ENV,
      DATABASE_URL: undefined,
      STRIPE_SECRET_KEY: undefined,
    };
    let message = "";
    try {
      validateEnv(env);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("STRIPE_SECRET_KEY");
  });

  it("does not require INTERNAL_API_TOKEN when SEARCH_INDEX_ENABLED is unset", () => {
    const env = { ...VALID_ENV };
    delete env.SEARCH_INDEX_ENABLED;
    delete env.INTERNAL_API_TOKEN;
    expect(() => validateEnv(env)).not.toThrow();
  });

  it("requires INTERNAL_API_TOKEN when SEARCH_INDEX_ENABLED === 'true'", () => {
    const env = {
      ...VALID_ENV,
      SEARCH_INDEX_ENABLED: "true",
      INTERNAL_API_TOKEN: undefined,
    };
    expect(() => validateEnv(env)).toThrow(/INTERNAL_API_TOKEN/);
  });

  it("does not require NEXT_PUBLIC_APP_URL", () => {
    const env = { ...VALID_ENV };
    delete env.NEXT_PUBLIC_APP_URL;
    expect(() => validateEnv(env)).not.toThrow();
  });

  it("does not require NEXT_PUBLIC_POSTHOG_KEY", () => {
    const env = { ...VALID_ENV };
    delete env.NEXT_PUBLIC_POSTHOG_KEY;
    expect(() => validateEnv(env)).not.toThrow();
  });

  it("throws when SHARE_LINK_COOKIE_SECRET is present but not 64 hex chars", () => {
    const env = { ...VALID_ENV, SHARE_LINK_COOKIE_SECRET: "notvalid" };
    expect(() => validateEnv(env)).toThrow(
      /SHARE_LINK_COOKIE_SECRET must be a 64-character hex string/
    );
  });

  it("throws when a required var is set to an empty string", () => {
    const env = { ...VALID_ENV, CLERK_SECRET_KEY: "   " };
    expect(() => validateEnv(env)).toThrow(/CLERK_SECRET_KEY/);
  });
});
