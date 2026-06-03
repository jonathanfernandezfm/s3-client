import prisma from "@/lib/db/prisma";
import type { ActivityAction } from "@/generated/prisma/client";

type SingleActivityInput = {
  connectionId: string;
  userId: string;
  userDisplayName: string;
  userImageUrl: string | null;
  action: ActivityAction;
  bucket: string;
  key?: string | null;
  targetKey?: string | null;
  byteSize?: bigint | null;
};

type BatchActivityInput = Omit<SingleActivityInput, "key" | "targetKey"> & {
  items: Array<{ key: string; targetKey?: string | null }>;
  batchId?: string;
};

export async function recordActivity(input: SingleActivityInput): Promise<void> {
  try {
    await prisma.activityEvent.create({
      data: {
        connectionId: input.connectionId,
        userId: input.userId,
        userDisplayName: input.userDisplayName,
        userImageUrl: input.userImageUrl,
        action: input.action,
        bucket: input.bucket,
        key: input.key,
        targetKey: input.targetKey,
        byteSize: input.byteSize,
        batchId: null,
      },
    });
  } catch (err) {
    console.error("[activity] recordActivity failed:", err);
  }
}

export async function recordActivityBatch(input: BatchActivityInput): Promise<void> {
  try {
    const batchId = input.batchId ?? crypto.randomUUID();
    await prisma.activityEvent.createMany({
      data: input.items.map((item) => ({
        connectionId: input.connectionId,
        userId: input.userId,
        userDisplayName: input.userDisplayName,
        userImageUrl: input.userImageUrl,
        action: input.action,
        bucket: input.bucket,
        key: item.key,
        targetKey: item.targetKey ?? null,
        byteSize: input.byteSize ?? null,
        batchId,
      })),
    });
  } catch (err) {
    console.error("[activity] recordActivityBatch failed:", err);
  }
}
