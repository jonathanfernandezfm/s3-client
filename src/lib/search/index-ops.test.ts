import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  default: {
    objectIndex: {
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
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
