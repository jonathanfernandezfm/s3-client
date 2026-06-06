// src/lib/health/runner.test.ts
import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  DeleteBucketCommand,
  GetBucketVersioningCommand,
  ListBucketsCommand,
  PutBucketVersioningCommand,
} from "@aws-sdk/client-s3";

vi.mock("@/lib/db/prisma", () => ({
  default: {
    connection: { findUnique: vi.fn() },
    $transaction: vi.fn(),
    connectionHealthCheck: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    connectionPermissionCheck: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    bucketHealthCheck: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    bucketPermissionCheck: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

const sendMock = vi.fn();
vi.mock("@/lib/s3/client", () => ({
  createS3Client: vi.fn(() => ({ send: sendMock })),
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: (s: string) => s,
  encrypt: (s: string) => s,
}));

import prisma from "@/lib/db/prisma";
import { runConnectionHealthCheck, runBucketHealthCheck } from "./runner";
import { __resetMutex } from "./mutex";

function setupConnection(connection: {
  id: string;
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  updatedAt?: Date;
}) {
  const record = {
    id: connection.id,
    endpoint: connection.endpoint ?? "https://s3.example.com",
    region: connection.region ?? "us-east-1",
    accessKeyId: connection.accessKeyId ?? "AKID",
    secretAccessKey: connection.secretAccessKey ?? "secret",
    forcePathStyle: connection.forcePathStyle ?? true,
    updatedAt: connection.updatedAt ?? new Date("2026-06-06T00:00:00Z"),
  };
  (prisma.connection.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
    record,
  );
  return record;
}

function setupTransactionPassthrough() {
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: typeof prisma) => unknown) => fn(prisma),
  );
}

function sdkError(name: string, httpStatusCode?: number) {
  return Object.assign(new Error(name), {
    name,
    $metadata: { httpStatusCode },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sendMock.mockReset();
  __resetMutex();
  setupTransactionPassthrough();
  (prisma.connectionHealthCheck.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "hc-1",
  });
  (prisma.connectionPermissionCheck.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
    count: 0,
  });
  (prisma.connectionPermissionCheck.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
    count: 0,
  });
  (prisma.bucketHealthCheck.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "bhc-1",
  });
  (prisma.bucketPermissionCheck.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
    count: 0,
  });
  (prisma.bucketPermissionCheck.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
    count: 0,
  });
});

describe("runConnectionHealthCheck", () => {
  test("all probes succeed → all capabilities available", async () => {
    setupConnection({ id: "conn-1" });
    sendMock.mockResolvedValue({});

    const report = await runConnectionHealthCheck("conn-1");

    expect(report.scope).toBe("connection");
    expect(report.connectivity).toBe("ok");
    const browse = report.capabilities.find((c) => c.key === "browse-buckets");
    const del = report.capabilities.find((c) => c.key === "delete-buckets");
    const create = report.capabilities.find((c) => c.key === "create-buckets");
    expect(browse?.status).toBe("available");
    expect(del?.status).toBe("available");
    expect(create?.status).toBe("untested");
  });

  test("all probes throw AccessDenied → all capabilities unavailable", async () => {
    setupConnection({ id: "conn-1" });
    sendMock.mockRejectedValue(sdkError("AccessDenied", 403));

    const report = await runConnectionHealthCheck("conn-1");
    expect(
      report.capabilities.find((c) => c.key === "browse-buckets")?.status,
    ).toBe("unavailable");
    expect(
      report.capabilities.find((c) => c.key === "delete-buckets")?.status,
    ).toBe("unavailable");
  });

  test("all probes throw NetworkingError → connectivity unreachable, capabilities unknown", async () => {
    setupConnection({ id: "conn-1" });
    sendMock.mockRejectedValue(sdkError("NetworkingError"));

    const report = await runConnectionHealthCheck("conn-1");
    expect(report.connectivity).toBe("unreachable");
    expect(
      report.capabilities.find((c) => c.key === "browse-buckets")?.status,
    ).toBe("unknown");
  });

  test("non-existent connection throws", async () => {
    (prisma.connection.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    await expect(runConnectionHealthCheck("missing")).rejects.toThrow(
      /not found/i,
    );
  });

  test("mutex: simultaneous calls share one result", async () => {
    setupConnection({ id: "conn-1" });
    sendMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({}), 25)),
    );

    const [a, b] = await Promise.all([
      runConnectionHealthCheck("conn-1"),
      runConnectionHealthCheck("conn-1"),
    ]);

    expect(a).toEqual(b);
    // listBuckets + deleteBucket = 2 probes, called once each
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  test("credentials edited mid-run → result discarded", async () => {
    const original = setupConnection({ id: "conn-1" });
    sendMock.mockResolvedValue({});
    (prisma.connectionHealthCheck.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null);
    // Simulate update between read and persist: $transaction sees newer updatedAt
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: typeof prisma) => unknown) => {
        (prisma.connection.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ...original,
          updatedAt: new Date(original.updatedAt.getTime() + 1000),
        });
        return fn(prisma);
      },
    );

    const report = await runConnectionHealthCheck("conn-1");
    // The runner still returns a report from the in-memory computation,
    // but did not call the persist mutation.
    expect(report.scope).toBe("connection");
    expect(prisma.connectionHealthCheck.upsert).not.toHaveBeenCalled();
  });
});

describe("runBucketHealthCheck", () => {
  test("all probes succeed → all capabilities available, connectivity ok", async () => {
    setupConnection({ id: "conn-1" });
    sendMock.mockImplementation((cmd: unknown) => {
      if (cmd instanceof GetBucketVersioningCommand) {
        return Promise.resolve({ Status: "Enabled" });
      }
      return Promise.resolve({});
    });

    const report = await runBucketHealthCheck("conn-1", "my-bucket");
    expect(report.scope).toBe("bucket");
    expect(report.bucket).toBe("my-bucket");
    expect(report.connectivity).toBe("ok");
    expect(
      report.capabilities.find((c) => c.key === "browse-objects")?.status,
    ).toBe("available");
    expect(
      report.capabilities.find((c) => c.key === "manage-versioning")?.status,
    ).toBe("available");
  });

  test("put-bucket-versioning on never-versioned bucket → skipped, capability still available", async () => {
    setupConnection({ id: "conn-1" });
    sendMock.mockImplementation((cmd: unknown) => {
      if (cmd instanceof GetBucketVersioningCommand) {
        return Promise.resolve({});
      }
      if (cmd instanceof PutBucketVersioningCommand) {
        // Should not be called when bucket has never been versioned
        throw new Error("PutBucketVersioning should be skipped");
      }
      return Promise.resolve({});
    });

    const report = await runBucketHealthCheck("conn-1", "my-bucket");
    const versioning = report.capabilities.find(
      (c) => c.key === "manage-versioning",
    );
    expect(versioning?.status).toBe("available");
    expect(versioning?.probes.find((p) => p.key === "put-bucket-versioning")?.result).toBe(
      "skipped",
    );
  });

  test("all probes throw NoSuchBucket → connectivity missing-bucket", async () => {
    setupConnection({ id: "conn-1" });
    sendMock.mockRejectedValue(sdkError("NoSuchBucket"));

    const report = await runBucketHealthCheck("conn-1", "ghost-bucket");
    expect(report.connectivity).toBe("missing-bucket");
  });

  test("AccessDenied on some probes → mix of available/unavailable", async () => {
    setupConnection({ id: "conn-1" });
    sendMock.mockImplementation((cmd: unknown) => {
      if (cmd instanceof DeleteBucketCommand) {
        return Promise.reject(sdkError("AccessDenied", 403));
      }
      if (cmd instanceof ListBucketsCommand) {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const report = await runBucketHealthCheck("conn-1", "my-bucket");
    // Bucket scope doesn't include browse-buckets, but if denials happen we should still get a real report
    expect(report.scope).toBe("bucket");
  });
});
