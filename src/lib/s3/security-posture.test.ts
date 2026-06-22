import { describe, it, expect } from "vitest";
import { classifyPostureError } from "./security-posture";

describe("classifyPostureError", () => {
  it("returns 'not-configured' when name matches notConfiguredName", () => {
    expect(
      classifyPostureError(
        { name: "NoSuchPublicAccessBlockConfiguration" },
        "NoSuchPublicAccessBlockConfiguration",
      ),
    ).toBe("not-configured");
  });

  it("returns 'not-configured' when Code matches notConfiguredName (Code-only shape)", () => {
    expect(
      classifyPostureError(
        { Code: "NoSuchBucketPolicy" },
        "NoSuchBucketPolicy",
      ),
    ).toBe("not-configured");
  });

  it("returns 'not-configured' for ServerSideEncryptionConfigurationNotFoundError", () => {
    expect(
      classifyPostureError(
        { name: "ServerSideEncryptionConfigurationNotFoundError" },
        "ServerSideEncryptionConfigurationNotFoundError",
      ),
    ).toBe("not-configured");
  });

  it("returns 'unsupported' for NotImplemented", () => {
    expect(
      classifyPostureError({ name: "NotImplemented" }, "SomethingElse"),
    ).toBe("unsupported");
  });

  it("returns 'unsupported' for MethodNotAllowed", () => {
    expect(
      classifyPostureError({ name: "MethodNotAllowed" }, "SomethingElse"),
    ).toBe("unsupported");
  });

  it("returns 'unsupported' for $metadata.httpStatusCode === 501", () => {
    expect(
      classifyPostureError(
        { $metadata: { httpStatusCode: 501 } },
        "SomethingElse",
      ),
    ).toBe("unsupported");
  });

  it("returns 'denied' for AccessDenied", () => {
    expect(
      classifyPostureError({ name: "AccessDenied" }, "SomethingElse"),
    ).toBe("denied");
  });

  it("returns 'denied' for $metadata.httpStatusCode === 403", () => {
    expect(
      classifyPostureError(
        { $metadata: { httpStatusCode: 403 } },
        "SomethingElse",
      ),
    ).toBe("denied");
  });

  it("returns 'error' for an unrecognized error", () => {
    expect(
      classifyPostureError(
        { name: "InternalError" },
        "NoSuchPublicAccessBlockConfiguration",
      ),
    ).toBe("error");
  });

  it("returns 'error' for an empty error object", () => {
    expect(classifyPostureError({}, "NoSuchBucketPolicy")).toBe("error");
  });
});
