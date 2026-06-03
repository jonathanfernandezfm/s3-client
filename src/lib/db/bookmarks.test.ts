import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  default: {
    bookmark: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db/connections", () => ({
  getConnectionAccessById: vi.fn().mockResolvedValue({ id: "conn-1" }),
}));

import prisma from "@/lib/db/prisma";
import { reorderBookmarks } from "./bookmarks";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reorderBookmarks", () => {
  test("runs a transaction setting sortOrder to the array index", async () => {
    (prisma.bookmark.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "bm-a", userId: "u1" },
      { id: "bm-b", userId: "u1" },
      { id: "bm-c", userId: "u1" },
    ]);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await reorderBookmarks("u1", ["bm-c", "bm-a", "bm-b"]);

    expect(result).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    const calls: unknown[] = (prisma.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calls).toHaveLength(3);
  });

  test("passes sortOrder indices matching the provided order", async () => {
    (prisma.bookmark.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "bm-a", userId: "u1" },
      { id: "bm-b", userId: "u1" },
    ]);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.bookmark.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await reorderBookmarks("u1", ["bm-b", "bm-a"]);

    expect(prisma.bookmark.update).toHaveBeenCalledWith({
      where: { id: "bm-b" },
      data: { sortOrder: 0 },
    });
    expect(prisma.bookmark.update).toHaveBeenCalledWith({
      where: { id: "bm-a" },
      data: { sortOrder: 1 },
    });
  });

  test("returns false when any ID does not belong to the user", async () => {
    (prisma.bookmark.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "bm-a", userId: "u1" },
      { id: "bm-b", userId: "u1" },
    ]);

    const result = await reorderBookmarks("u1", ["bm-a", "bm-b", "bm-foreign"]);

    expect(result).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("returns false for empty ids array", async () => {
    const result = await reorderBookmarks("u1", []);

    expect(result).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
