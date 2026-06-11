// src/lib/health/rollup.test.ts
import { describe, test, expect } from "vitest";
import { rollupCapability, buildCapabilities } from "./rollup";
import type { ProbeResultRecord } from "./probe";

function probe(
  key: string,
  capability: ProbeResultRecord["capability"],
  result: ProbeResultRecord["result"],
  required = true,
): ProbeResultRecord {
  return { key, capability, required, result, durationMs: 0 };
}

describe("rollupCapability", () => {
  test("no required probes → untested", () => {
    expect(
      rollupCapability("create-buckets", [
        probe("ignored", "create-buckets", "granted", false),
      ]),
    ).toBe("untested");
  });

  test("all required granted → available", () => {
    expect(
      rollupCapability("manage-versioning", [
        probe("get-bucket-versioning", "manage-versioning", "granted"),
        probe("put-bucket-versioning", "manage-versioning", "granted"),
      ]),
    ).toBe("available");
  });

  test("one required denied → unavailable", () => {
    expect(
      rollupCapability("manage-versioning", [
        probe("get-bucket-versioning", "manage-versioning", "granted"),
        probe("put-bucket-versioning", "manage-versioning", "denied"),
      ]),
    ).toBe("unavailable");
  });

  test("denied beats unsupported and error", () => {
    expect(
      rollupCapability("object-tagging", [
        probe("get-object-tagging", "object-tagging", "denied"),
        probe("put-object-tagging", "object-tagging", "unsupported"),
      ]),
    ).toBe("unavailable");
  });

  test("unsupported beats error", () => {
    expect(
      rollupCapability("list-versions", [
        probe("list-object-versions", "list-versions", "unsupported"),
      ]),
    ).toBe("unsupported");
  });

  test("error → unknown", () => {
    expect(
      rollupCapability("browse-objects", [
        probe("list-objects-v2", "browse-objects", "error"),
      ]),
    ).toBe("unknown");
  });

  test("skipped probes are filtered out before rollup", () => {
    expect(
      rollupCapability("manage-versioning", [
        probe("get-bucket-versioning", "manage-versioning", "granted"),
        probe("put-bucket-versioning", "manage-versioning", "skipped"),
      ]),
    ).toBe("available");
  });

  test("all required skipped → untested", () => {
    expect(
      rollupCapability("manage-versioning", [
        probe("get-bucket-versioning", "manage-versioning", "skipped"),
        probe("put-bucket-versioning", "manage-versioning", "skipped"),
      ]),
    ).toBe("untested");
  });

  test("skipped + denied → unavailable", () => {
    expect(
      rollupCapability("manage-versioning", [
        probe("get-bucket-versioning", "manage-versioning", "skipped"),
        probe("put-bucket-versioning", "manage-versioning", "denied"),
      ]),
    ).toBe("unavailable");
  });

  test("non-required probes are ignored entirely", () => {
    expect(
      rollupCapability("browse-objects", [
        probe("list-objects-v2", "browse-objects", "granted"),
        probe("informational", "browse-objects", "denied", false),
      ]),
    ).toBe("available");
  });
});

describe("buildCapabilities", () => {
  test("connection scope returns only connection-level capabilities", () => {
    const records: ProbeResultRecord[] = [
      probe("list-buckets", "browse-buckets", "granted"),
      probe("delete-bucket", "delete-buckets", "denied"),
    ];
    const caps = buildCapabilities("connection", records);
    expect(caps.map((c) => c.key)).toEqual([
      "browse-buckets",
      "create-buckets",
      "delete-buckets",
    ]);
    expect(caps.find((c) => c.key === "browse-buckets")?.status).toBe(
      "available",
    );
    expect(caps.find((c) => c.key === "create-buckets")?.status).toBe(
      "untested",
    );
    expect(caps.find((c) => c.key === "delete-buckets")?.status).toBe(
      "unavailable",
    );
  });

  test("each capability carries its IAM actions and affects copy", () => {
    const caps = buildCapabilities("connection", [
      probe("list-buckets", "browse-buckets", "granted"),
    ]);
    const browse = caps.find((c) => c.key === "browse-buckets");
    expect(browse?.requiredIamActions).toEqual(["s3:ListAllMyBuckets"]);
    expect(browse?.affects.length).toBeGreaterThan(0);
  });

  test("each capability carries the underlying probe details", () => {
    const caps = buildCapabilities("connection", [
      probe("list-buckets", "browse-buckets", "denied"),
    ]);
    const browse = caps.find((c) => c.key === "browse-buckets");
    expect(browse?.probes).toEqual([
      { key: "list-buckets", result: "denied", errorCode: undefined },
    ]);
  });

  test("bucket scope returns only bucket-level capabilities", () => {
    const records: ProbeResultRecord[] = [
      probe("list-objects-v2", "browse-objects", "granted"),
    ];
    const caps = buildCapabilities("bucket", records);
    expect(caps.map((c) => c.key)).not.toContain("browse-buckets");
    expect(caps.map((c) => c.key)).toContain("browse-objects");
  });

  test("capability with fixAction propagates it to the report", () => {
    // cors-direct-uploads is the only capability with fixAction set
    const caps = buildCapabilities("bucket", [
      probe("get-bucket-cors", "cors-direct-uploads", "denied"),
    ]);
    const cors = caps.find((c) => c.key === "cors-direct-uploads");
    expect(cors).toBeDefined();
    expect(cors?.fixAction).toBe("apply-cors");
  });
});
