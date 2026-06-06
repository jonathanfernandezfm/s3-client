import prisma from "@/lib/db/prisma";

export async function sweepStaleRows(
  connectionId: string,
  jobStartedAt: Date
): Promise<number> {
  const result = await prisma.objectIndex.deleteMany({
    where: { connectionId, lastSeenAt: { lt: jobStartedAt } },
  });
  return result.count;
}
