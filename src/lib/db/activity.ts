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

export type ActivityResult = { ok: true } | { ok: false; reason: string };

export async function recordActivity(input: SingleActivityInput): Promise<ActivityResult> {
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
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[activity] recordActivity failed", {
      connectionId: input.connectionId,
      action: input.action,
      bucket: input.bucket,
      key: input.key,
      userId: input.userId,
      reason,
    });
    return { ok: false, reason };
  }
}

export async function recordActivityWithBatch(
  input: SingleActivityInput & { batchId?: string | null }
): Promise<ActivityResult> {
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
        batchId: input.batchId ?? null,
      },
    });
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[activity] recordActivityWithBatch failed", {
      connectionId: input.connectionId,
      action: input.action,
      bucket: input.bucket,
      key: input.key,
      userId: input.userId,
      reason,
    });
    return { ok: false, reason };
  }
}

export async function recordActivityBatch(input: BatchActivityInput): Promise<ActivityResult> {
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
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[activity] recordActivityBatch failed", {
      connectionId: input.connectionId,
      action: input.action,
      bucket: input.bucket,
      userId: input.userId,
      reason,
    });
    return { ok: false, reason };
  }
}
