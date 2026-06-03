import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the module under test
vi.mock("@/lib/db/prisma", () => ({
  default: {
    activityEvent: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

// crypto.randomUUID is available in Node 14.17+ but vitest may stub it
const mockUUID = "test-batch-id-1234";
vi.stubGlobal("crypto", { randomUUID: () => mockUUID });

import prisma from "@/lib/db/prisma";
import { recordActivity, recordActivityBatch } from "./activity";

const baseInput = {
  connectionId: "conn-1",
  userId: "user-1",
  userDisplayName: "Alice Smith",
  userImageUrl: null,
  action: "UPLOAD" as const,
  bucket: "my-bucket",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordActivity", () => {
  test("creates one activity event row", async () => {
    (prisma.activityEvent.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await recordActivity({ ...baseInput, key: "folder/file.txt", byteSize: BigInt(1024) });

    expect(prisma.activityEvent.create).toHaveBeenCalledOnce();
    expect(prisma.activityEvent.create).toHaveBeenCalledWith({
      data: {
        connectionId: "conn-1",
        userId: "user-1",
        userDisplayName: "Alice Smith",
        userImageUrl: null,
        action: "UPLOAD",
        bucket: "my-bucket",
        key: "folder/file.txt",
        targetKey: undefined,
        byteSize: BigInt(1024),
        batchId: null,
      },
    });
  });

  test("swallows errors and logs them without throwing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (prisma.activityEvent.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("DB connection lost")
    );

    await expect(
      recordActivity({ ...baseInput, key: "file.txt" })
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test("passes null key and targetKey when not provided", async () => {
    (prisma.activityEvent.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await recordActivity({ ...baseInput, action: "BUCKET_CREATE" });

    const call = (prisma.activityEvent.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.key).toBeUndefined();
    expect(call.data.batchId).toBeNull();
  });
});

describe("recordActivityBatch", () => {
  test("calls createMany with one row per item plus a shared batchId", async () => {
    (prisma.activityEvent.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 });

    await recordActivityBatch({
      ...baseInput,
      action: "DELETE",
      items: [{ key: "a.txt" }, { key: "b.txt" }],
    });

    expect(prisma.activityEvent.createMany).toHaveBeenCalledOnce();
    const { data } = (prisma.activityEvent.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(data).toHaveLength(2);
    expect(data[0].key).toBe("a.txt");
    expect(data[1].key).toBe("b.txt");
    expect(data[0].batchId).toBe(mockUUID);
    expect(data[1].batchId).toBe(mockUUID);
  });

  test("all rows share the same batchId", async () => {
    (prisma.activityEvent.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 3 });

    await recordActivityBatch({
      ...baseInput,
      action: "COPY",
      items: [{ key: "x.txt", targetKey: "copy/x.txt" }, { key: "y.txt", targetKey: "copy/y.txt" }, { key: "z.txt" }],
    });

    const { data } = (prisma.activityEvent.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const batchIds = new Set(data.map((r: { batchId: string }) => r.batchId));
    expect(batchIds.size).toBe(1);
  });

  test("accepts an explicit batchId (for cross-connection ops)", async () => {
    (prisma.activityEvent.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await recordActivityBatch({
      ...baseInput,
      action: "MOVE",
      items: [{ key: "a.txt" }],
      batchId: "explicit-batch-id",
    });

    const { data } = (prisma.activityEvent.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(data[0].batchId).toBe("explicit-batch-id");
  });

  test("swallows errors and logs them without throwing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (prisma.activityEvent.createMany as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("timeout")
    );

    await expect(
      recordActivityBatch({
        ...baseInput,
        action: "DELETE",
        items: [{ key: "file.txt" }],
      })
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test("targetKey is passed through per item", async () => {
    (prisma.activityEvent.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await recordActivityBatch({
      ...baseInput,
      action: "RENAME",
      items: [{ key: "old.txt", targetKey: "new.txt" }],
    });

    const { data } = (prisma.activityEvent.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(data[0].targetKey).toBe("new.txt");
  });
});
