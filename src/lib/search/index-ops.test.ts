import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  default: {
    objectIndex: {
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/search/feature-flag", () => ({
  isSearchIndexEnabled: vi.fn(() => true),
}));

import prisma from "@/lib/db/prisma";
import { isSearchIndexEnabled } from "./feature-flag";
import {
  indexUpsert,
  indexDelete,
  indexRename,
  indexUpdateTags,
  indexTagsForKeys,
  indexBulkDelete,
  indexBulkUpsert,
} from "./index-ops";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isSearchIndexEnabled).mockReturnValue(true);
});

describe("indexUpsert", () => {
  test("derives extension and mime from key", async () => {
    await indexUpsert({
      workspaceId: "w1",
      connectionId: "c1",
      bucket: "b1",
      key: "branding/logo.PNG",
      size: 1024n,
      lastModified: new Date("2026-06-01"),
      etag: "abc",
    });

    expect(prisma.objectIndex.upsert).toHaveBeenCalledOnce();
    const args = vi.mocked(prisma.objectIndex.upsert).mock.calls[0][0];
    expect(args.where).toEqual({
      connectionId_bucket_key: { connectionId: "c1", bucket: "b1", key: "branding/logo.PNG" },
    });
    expect(args.create.extension).toBe("png");
    expect(args.create.mime).toBe("image/png");
  });

  test("no-op when flag disabled", async () => {
    vi.mocked(isSearchIndexEnabled).mockReturnValue(false);
    await indexUpsert({
      workspaceId: "w1",
      connectionId: "c1",
      bucket: "b1",
      key: "x.png",
      size: 1n,
      lastModified: new Date(),
      etag: null,
    });
    expect(prisma.objectIndex.upsert).not.toHaveBeenCalled();
  });

  test("swallows errors and logs", async () => {
    const err = new Error("db down");
    vi.mocked(prisma.objectIndex.upsert).mockRejectedValueOnce(err);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await indexUpsert({
      workspaceId: "w1",
      connectionId: "c1",
      bucket: "b1",
      key: "x.png",
      size: 1n,
      lastModified: new Date(),
      etag: null,
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("indexDelete", () => {
  test("deletes by composite key", async () => {
    await indexDelete({ connectionId: "c1", bucket: "b1", key: "x.png" });
    expect(prisma.objectIndex.deleteMany).toHaveBeenCalledWith({
      where: { connectionId: "c1", bucket: "b1", key: "x.png" },
    });
  });
});

describe("indexRename", () => {
  test("uses a transaction containing delete + upsert", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (calls) => {
      // Prisma's $transaction supports array-of-promises form
      if (Array.isArray(calls)) return Promise.all(calls);
      return calls(prisma as never);
    });
    await indexRename({
      workspaceId: "w1",
      connectionId: "c1",
      bucket: "b1",
      fromKey: "old.png",
      toKey: "new.png",
      size: 100n,
      lastModified: new Date("2026-06-01"),
      etag: "e",
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

describe("indexUpdateTags", () => {
  test("updates the tags column", async () => {
    await indexUpdateTags({
      connectionId: "c1",
      bucket: "b1",
      key: "x.png",
      tags: ["invoice", "march"],
    });
    expect(prisma.objectIndex.update).toHaveBeenCalledWith({
      where: { connectionId_bucket_key: { connectionId: "c1", bucket: "b1", key: "x.png" } },
      data: { tags: ["invoice", "march"] },
    });
  });
});

describe("indexTagsForKeys", () => {
  test("returns key → tag values map, skipping untagged rows", async () => {
    vi.mocked(prisma.objectIndex.findMany).mockResolvedValue([
      { key: "a.txt", tags: ["prod", "archive"] },
      { key: "b.txt", tags: [] },
    ] as never);

    const result = await indexTagsForKeys({
      connectionId: "c1",
      bucket: "b1",
      keys: ["a.txt", "b.txt", "c.txt"],
    });

    expect(result).toEqual({ "a.txt": ["prod", "archive"] });
    const args = vi.mocked(prisma.objectIndex.findMany).mock.calls[0][0];
    expect(args?.where).toEqual({
      connectionId: "c1",
      bucket: "b1",
      key: { in: ["a.txt", "b.txt", "c.txt"] },
    });
  });

  test("filters out non-string entries in the jsonb array", async () => {
    vi.mocked(prisma.objectIndex.findMany).mockResolvedValue([
      { key: "a.txt", tags: ["prod", 42, null] },
      { key: "b.txt", tags: "not-an-array" },
    ] as never);

    const result = await indexTagsForKeys({
      connectionId: "c1",
      bucket: "b1",
      keys: ["a.txt", "b.txt"],
    });

    expect(result).toEqual({ "a.txt": ["prod"] });
  });

  test("returns empty map when flag disabled, without querying", async () => {
    vi.mocked(isSearchIndexEnabled).mockReturnValue(false);
    const result = await indexTagsForKeys({
      connectionId: "c1",
      bucket: "b1",
      keys: ["a.txt"],
    });
    expect(result).toEqual({});
    expect(prisma.objectIndex.findMany).not.toHaveBeenCalled();
  });

  test("returns empty map for empty key list, without querying", async () => {
    const result = await indexTagsForKeys({
      connectionId: "c1",
      bucket: "b1",
      keys: [],
    });
    expect(result).toEqual({});
    expect(prisma.objectIndex.findMany).not.toHaveBeenCalled();
  });

  test("swallows errors and returns empty map", async () => {
    vi.mocked(prisma.objectIndex.findMany).mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await indexTagsForKeys({
      connectionId: "c1",
      bucket: "b1",
      keys: ["a.txt"],
    });
    expect(result).toEqual({});
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("indexBulkDelete", () => {
  test("short-circuits on empty keys array (does not call prisma)", async () => {
    await indexBulkDelete({ connectionId: "c1", bucket: "b1", keys: [] });

    expect(prisma.objectIndex.deleteMany).not.toHaveBeenCalled();
  });

  test("short-circuits when isSearchIndexEnabled returns false", async () => {
    vi.mocked(isSearchIndexEnabled).mockReturnValue(false);

    await indexBulkDelete({ connectionId: "c1", bucket: "b1", keys: ["file1.txt", "file2.txt"] });

    expect(prisma.objectIndex.deleteMany).not.toHaveBeenCalled();
  });

  test("calls prisma.objectIndex.deleteMany once on happy path", async () => {
    vi.mocked(prisma.objectIndex.deleteMany).mockResolvedValue({ count: 2 } as never);

    await indexBulkDelete({ connectionId: "c1", bucket: "b1", keys: ["file1.txt", "file2.txt"] });

    expect(prisma.objectIndex.deleteMany).toHaveBeenCalledOnce();
    expect(prisma.objectIndex.deleteMany).toHaveBeenCalledWith({
      where: {
        connectionId: "c1",
        bucket: "b1",
        key: { in: ["file1.txt", "file2.txt"] },
      },
    });
  });

  test("swallows a prisma rejection (no exception propagates)", async () => {
    vi.mocked(prisma.objectIndex.deleteMany).mockRejectedValueOnce(new Error("DB connection lost"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      indexBulkDelete({ connectionId: "c1", bucket: "b1", keys: ["file1.txt"] })
    ).resolves.toBeUndefined();

    spy.mockRestore();
  });
});

describe("indexBulkUpsert", () => {
  test("happy path produces exactly one $executeRaw call", async () => {
    vi.mocked(prisma.$executeRaw).mockResolvedValue(2 as never);

    await indexBulkUpsert([
      {
        workspaceId: "ws-1",
        connectionId: "c1",
        bucket: "b1",
        key: "file1.txt",
        size: 1024n,
        lastModified: new Date("2024-01-01"),
        etag: '"abc123"',
      },
      {
        workspaceId: "ws-1",
        connectionId: "c1",
        bucket: "b1",
        key: "file2.txt",
        size: 2048n,
        lastModified: new Date("2024-01-02"),
        etag: null,
      },
    ]);

    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
  });
});
