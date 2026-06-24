import { describe, test, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any imports of the modules under test
// ---------------------------------------------------------------------------

vi.mock("@/lib/db/connections", () => ({
  listConnectionsWithAccess: vi.fn(),
  getConnectionAccessById: vi.fn(),
}));

vi.mock("@/lib/subscriptions", () => ({
  meterOperation: vi.fn(),
}));

vi.mock("@/lib/s3/client", () => ({
  createS3Client: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { listConnectionsWithAccess, getConnectionAccessById } from "@/lib/db/connections";
import { meterOperation } from "@/lib/subscriptions";
import { createS3Client } from "@/lib/s3/client";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  listConnections,
  listBuckets,
  listObjects,
  headObject,
  presignDownload,
} from "./tools";
import type { AuthUser } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockUser: AuthUser = {
  id: "u1",
  clerkId: "clerk_u1",
  email: "test@example.com",
  firstName: null,
  lastName: null,
  imageUrl: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  subscription: { id: "sub1", userId: "u1", tier: "FREE" as const, stripeCustomerId: null, stripePriceId: null, stripeSubscriptionId: null, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, createdAt: new Date(0), updatedAt: new Date(0) },
};

const mockAccess = {
  connection: {
    id: "conn1",
    name: "My Connection",
    endpoint: "https://s3.example.com",
    region: "us-east-1",
    accessKeyId: "AKID",
    secretAccessKey: "secret-value",
    forcePathStyle: true,
    workspaceId: "ws1",
    createdById: "u1",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  },
  workspaceId: "ws1",
  workspaceType: "PERSONAL" as const,
  role: "ADMIN" as const,
};

const mockSendFn = vi.fn();
const mockClient = { send: mockSendFn };

beforeEach(() => {
  vi.clearAllMocks();
  (createS3Client as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);
  (meterOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ allowed: true });
  (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValue(mockAccess);
});

// ---------------------------------------------------------------------------
// list_connections
// ---------------------------------------------------------------------------

describe("listConnections", () => {
  test("maps connection entries to summary shape", async () => {
    (listConnectionsWithAccess as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        connection: { id: "c1", name: "Prod", endpoint: "https://s3.example.com", region: "eu-west-1" },
        role: "ADMIN",
        workspaceId: "ws1",
        workspaceType: "PERSONAL",
      },
    ]);

    const result = await listConnections(mockUser);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "c1", name: "Prod", role: "ADMIN" });
  });

  test("does not expose secretAccessKey", async () => {
    (listConnectionsWithAccess as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        connection: { id: "c1", name: "Prod", endpoint: "https://e", region: "us-east-1", secretAccessKey: "should-not-appear" },
        role: "ADMIN",
        workspaceId: "ws1",
        workspaceType: "PERSONAL",
      },
    ]);

    const result = await listConnections(mockUser);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("should-not-appear");
    expect(serialized).not.toContain("secretAccessKey");
  });
});

// ---------------------------------------------------------------------------
// list_buckets
// ---------------------------------------------------------------------------

describe("listBuckets", () => {
  test("throws 'Connection not found' when getConnectionAccessById returns null", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(listBuckets(mockUser, { connectionId: "bad" })).rejects.toThrow(
      "Connection not found"
    );
  });

  test("throws meter reason when meterOperation returns allowed:false", async () => {
    (meterOperation as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      reason: "Monthly operation limit reached (1,000 / 1,000)",
    });

    await expect(listBuckets(mockUser, { connectionId: "conn1" })).rejects.toThrow(
      "Monthly operation limit reached"
    );
  });

  test("returns bucket list from S3", async () => {
    mockSendFn.mockResolvedValue({
      Buckets: [
        { Name: "my-bucket", CreationDate: new Date("2024-01-01") },
        { Name: "other-bucket", CreationDate: null },
      ],
    });

    const result = await listBuckets(mockUser, { connectionId: "conn1" });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: "my-bucket" });
    expect(result[1]).toMatchObject({ name: "other-bucket", creationDate: null });
  });

  test("does not include secretAccessKey in returned data", async () => {
    mockSendFn.mockResolvedValue({ Buckets: [{ Name: "b1", CreationDate: new Date() }] });

    const result = await listBuckets(mockUser, { connectionId: "conn1" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

// ---------------------------------------------------------------------------
// list_objects
// ---------------------------------------------------------------------------

describe("listObjects", () => {
  test("maps CommonPrefixes to folders and Contents to files", async () => {
    mockSendFn.mockResolvedValue({
      CommonPrefixes: [{ Prefix: "logs/" }, { Prefix: "data/" }],
      Contents: [
        { Key: "readme.txt", Size: 100, ETag: '"abc"', LastModified: new Date("2024-06-01"), StorageClass: "STANDARD" },
      ],
      IsTruncated: false,
    });

    const result = await listObjects(mockUser, { connectionId: "conn1", bucket: "my-bucket" });

    expect(result.objects).toHaveLength(3);
    expect(result.objects[0]).toMatchObject({ key: "logs/", isFolder: true });
    expect(result.objects[1]).toMatchObject({ key: "data/", isFolder: true });
    expect(result.objects[2]).toMatchObject({ key: "readme.txt", isFolder: false, size: 100 });
  });

  test("drops the prefix row from Contents (the folder itself)", async () => {
    mockSendFn.mockResolvedValue({
      CommonPrefixes: [],
      Contents: [
        { Key: "logs/", Size: 0 },        // this is the prefix row — must be filtered out
        { Key: "logs/app.log", Size: 200 },
      ],
      IsTruncated: false,
    });

    const result = await listObjects(mockUser, {
      connectionId: "conn1",
      bucket: "my-bucket",
      prefix: "logs/",
    });

    const keys = result.objects.map((o) => o.key);
    expect(keys).not.toContain("logs/");
    expect(keys).toContain("logs/app.log");
  });

  test("passes continuationToken and returns nextContinuationToken", async () => {
    mockSendFn.mockResolvedValue({
      CommonPrefixes: [],
      Contents: [{ Key: "file.txt", Size: 1 }],
      IsTruncated: true,
      NextContinuationToken: "tok-next",
    });

    const result = await listObjects(mockUser, {
      connectionId: "conn1",
      bucket: "my-bucket",
      continuationToken: "tok-prev",
    });

    expect(result.isTruncated).toBe(true);
    expect(result.nextContinuationToken).toBe("tok-next");

    const cmd = mockSendFn.mock.calls[0][0];
    expect(cmd.input.ContinuationToken).toBe("tok-prev");
  });

  test("throws 'Connection not found' when access is null", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      listObjects(mockUser, { connectionId: "bad", bucket: "b" })
    ).rejects.toThrow("Connection not found");
  });

  test("throws meter reason when meterOperation returns allowed:false", async () => {
    (meterOperation as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      reason: "Limit exceeded",
    });
    await expect(
      listObjects(mockUser, { connectionId: "conn1", bucket: "b" })
    ).rejects.toThrow("Limit exceeded");
  });

  test("does not return secretAccessKey in result", async () => {
    mockSendFn.mockResolvedValue({ CommonPrefixes: [], Contents: [], IsTruncated: false });
    const result = await listObjects(mockUser, { connectionId: "conn1", bucket: "b" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

// ---------------------------------------------------------------------------
// head_object
// ---------------------------------------------------------------------------

describe("headObject", () => {
  test("returns compact metadata object", async () => {
    mockSendFn.mockResolvedValue({
      ContentType: "text/plain",
      ContentLength: 512,
      ETag: '"etag123"',
      LastModified: new Date("2024-03-01"),
      StorageClass: "STANDARD",
      Metadata: { author: "alice" },
    });

    const result = await headObject(mockUser, {
      connectionId: "conn1",
      bucket: "b",
      key: "file.txt",
    });

    expect(result.contentType).toBe("text/plain");
    expect(result.contentLength).toBe(512);
    expect(result.etag).toBe('"etag123"');
    expect(result.metadata).toEqual({ author: "alice" });
  });

  test("throws 'Object not found' for 404 S3 error", async () => {
    const err = Object.assign(new Error("Not Found"), {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });
    mockSendFn.mockRejectedValue(err);

    await expect(
      headObject(mockUser, { connectionId: "conn1", bucket: "b", key: "missing.txt" })
    ).rejects.toThrow("Object not found");
  });

  test("throws 'Connection not found' when access is null", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      headObject(mockUser, { connectionId: "bad", bucket: "b", key: "k" })
    ).rejects.toThrow("Connection not found");
  });

  test("does not return secretAccessKey", async () => {
    mockSendFn.mockResolvedValue({ ContentType: "text/plain", Metadata: {} });
    const result = await headObject(mockUser, { connectionId: "conn1", bucket: "b", key: "f" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

// ---------------------------------------------------------------------------
// presign_download
// ---------------------------------------------------------------------------

describe("presignDownload", () => {
  test("returns signed URL with default expiresIn=900", async () => {
    (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue("https://signed-url.example.com/obj?X-Amz-Expires=900");

    const result = await presignDownload(mockUser, {
      connectionId: "conn1",
      bucket: "b",
      key: "file.pdf",
    });

    expect(result.url).toContain("https://signed-url.example.com");
    expect(result.expiresIn).toBe(900);
    expect(getSignedUrl).toHaveBeenCalledWith(
      mockClient,
      expect.anything(),
      { expiresIn: 900 }
    );
  });

  test("clamps expiresIn below 60 to 60", async () => {
    (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue("https://url");
    const result = await presignDownload(mockUser, {
      connectionId: "conn1",
      bucket: "b",
      key: "f",
      expiresIn: 10,
    });
    expect(result.expiresIn).toBe(60);
  });

  test("clamps expiresIn above 3600 to 3600", async () => {
    (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue("https://url");
    const result = await presignDownload(mockUser, {
      connectionId: "conn1",
      bucket: "b",
      key: "f",
      expiresIn: 9999,
    });
    expect(result.expiresIn).toBe(3600);
  });

  test("throws 'Connection not found' when access is null", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      presignDownload(mockUser, { connectionId: "bad", bucket: "b", key: "k" })
    ).rejects.toThrow("Connection not found");
  });

  test("throws meter reason when meterOperation returns allowed:false", async () => {
    (meterOperation as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      reason: "Quota exhausted",
    });
    await expect(
      presignDownload(mockUser, { connectionId: "conn1", bucket: "b", key: "k" })
    ).rejects.toThrow("Quota exhausted");
  });

  test("does not return secretAccessKey", async () => {
    (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue("https://url");
    const result = await presignDownload(mockUser, {
      connectionId: "conn1",
      bucket: "b",
      key: "f",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
