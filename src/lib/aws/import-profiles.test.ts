import { describe, test, expect, vi } from "vitest";
import { importAwsProfile, type ImportProfileDeps } from "./import-profiles";

const VALID_PROFILE = {
  name: "dev",
  region: "us-west-2",
  accessKeyId: "AKIA_DEV",
  secretAccessKey: "secret_dev",
};

function makeDeps(overrides: Partial<ImportProfileDeps> = {}): ImportProfileDeps {
  return {
    validateCredentials: vi.fn().mockResolvedValue({ ok: true }),
    saveConnection: vi.fn().mockResolvedValue({ id: "conn-123" }),
    ...overrides,
  };
}

describe("importAwsProfile", () => {
  test("returns 'saved' with the new connection id when validate + save succeed", async () => {
    const deps = makeDeps();
    const result = await importAwsProfile(VALID_PROFILE, deps);

    expect(result).toEqual({
      name: "dev",
      status: "saved",
      connectionId: "conn-123",
    });
  });

  test("passes the AWS endpoint and forcePathStyle=false to saveConnection", async () => {
    const saveConnection = vi.fn().mockResolvedValue({ id: "conn-1" });
    const deps = makeDeps({ saveConnection });

    await importAwsProfile(VALID_PROFILE, deps);

    expect(saveConnection).toHaveBeenCalledWith({
      name: "dev",
      endpoint: "https://s3.amazonaws.com",
      region: "us-west-2",
      accessKeyId: "AKIA_DEV",
      secretAccessKey: "secret_dev",
      forcePathStyle: false,
    });
  });

  test("returns 'invalid' with the validate error when credentials don't work, and never saves", async () => {
    const saveConnection = vi.fn();
    const deps = makeDeps({
      validateCredentials: vi.fn().mockResolvedValue({ ok: false, error: "InvalidAccessKeyId" }),
      saveConnection,
    });

    const result = await importAwsProfile(VALID_PROFILE, deps);

    expect(result).toEqual({
      name: "dev",
      status: "invalid",
      error: "InvalidAccessKeyId",
    });
    expect(saveConnection).not.toHaveBeenCalled();
  });

  test("returns 'invalid' with the failure error when saveConnection throws", async () => {
    const deps = makeDeps({
      saveConnection: vi.fn().mockRejectedValue(new Error("DB unavailable")),
    });

    const result = await importAwsProfile(VALID_PROFILE, deps);

    expect(result).toEqual({
      name: "dev",
      status: "invalid",
      error: "DB unavailable",
    });
  });

  test("returns 'invalid' with a generic message when validateCredentials throws", async () => {
    const deps = makeDeps({
      validateCredentials: vi.fn().mockRejectedValue(new Error("network: ECONNRESET")),
    });

    const result = await importAwsProfile(VALID_PROFILE, deps);

    expect(result.status).toBe("invalid");
    expect(result.error).toContain("ECONNRESET");
  });
});
