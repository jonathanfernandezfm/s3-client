import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  default: {
    workspace: {
      findMany: vi.fn(),
    },
  },
}));

import prisma from "@/lib/db/prisma";
import { getUserWorkspaceIds, __resetCacheForTest } from "./workspace-ids";

beforeEach(() => {
  vi.clearAllMocks();
  __resetCacheForTest();
});

describe("getUserWorkspaceIds", () => {
  test("returns IDs from personal + team workspaces", async () => {
    vi.mocked(prisma.workspace.findMany).mockResolvedValue([
      { id: "w-personal" } as never,
      { id: "w-team-a" } as never,
      { id: "w-team-b" } as never,
    ]);
    const ids = await getUserWorkspaceIds("user-1");
    expect(ids).toEqual(["w-personal", "w-team-a", "w-team-b"]);
  });

  test("caches per user", async () => {
    vi.mocked(prisma.workspace.findMany).mockResolvedValue([{ id: "w1" } as never]);
    await getUserWorkspaceIds("user-1");
    await getUserWorkspaceIds("user-1");
    expect(prisma.workspace.findMany).toHaveBeenCalledOnce();
  });

  test("different users do not share cache entries", async () => {
    vi.mocked(prisma.workspace.findMany)
      .mockResolvedValueOnce([{ id: "w-a" } as never])
      .mockResolvedValueOnce([{ id: "w-b" } as never]);
    expect(await getUserWorkspaceIds("user-a")).toEqual(["w-a"]);
    expect(await getUserWorkspaceIds("user-b")).toEqual(["w-b"]);
  });

  test("empty when user belongs to nothing", async () => {
    vi.mocked(prisma.workspace.findMany).mockResolvedValue([]);
    expect(await getUserWorkspaceIds("ghost")).toEqual([]);
  });
});
