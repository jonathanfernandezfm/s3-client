import { LRUCache } from "lru-cache";
import prisma from "@/lib/db/prisma";

const cache = new LRUCache<string, string[]>({
  max: 5000,
  ttl: 60_000,
});

export async function getUserWorkspaceIds(userId: string): Promise<string[]> {
  const cached = cache.get(userId);
  if (cached) return cached;
  const workspaces = await prisma.workspace.findMany({
    where: {
      OR: [
        { type: "PERSONAL", userId },
        { type: "TEAM", team: { members: { some: { userId } } } },
      ],
    },
    select: { id: true },
  });
  const ids = workspaces.map((w) => w.id);
  cache.set(userId, ids);
  return ids;
}

export function __resetCacheForTest(): void {
  cache.clear();
}
