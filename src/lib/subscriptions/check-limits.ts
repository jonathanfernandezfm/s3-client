import prisma from "@/lib/db/prisma";
import { TIER_LIMITS, isUnlimited } from "./tiers";
import type { SubscriptionTier } from "@/generated/prisma/client";

export type LimitCheckResult = {
  allowed: boolean;
  reason?: string;
  current?: number;
  limit?: number;
};

export async function canCreateConnection(
  workspaceId: string,
  tier: SubscriptionTier
): Promise<LimitCheckResult> {
  const limit = TIER_LIMITS[tier].maxConnections;

  if (isUnlimited(limit)) {
    return { allowed: true };
  }

  const count = await prisma.connection.count({
    where: { workspaceId },
  });

  if (count >= limit) {
    return {
      allowed: false,
      reason: `You have reached the maximum of ${limit} connections for your ${tier} plan. Upgrade to add more connections.`,
      current: count,
      limit,
    };
  }

  return { allowed: true, current: count, limit };
}

export function canUploadFileSize(
  fileSizeBytes: number,
  tier: SubscriptionTier
): LimitCheckResult {
  const limitMB = TIER_LIMITS[tier].maxUploadSizeMB;

  if (isUnlimited(limitMB)) {
    return { allowed: true };
  }

  const fileSizeMB = fileSizeBytes / (1024 * 1024);

  if (fileSizeMB > limitMB) {
    return {
      allowed: false,
      reason: `File size (${Math.round(fileSizeMB)}MB) exceeds the ${limitMB}MB limit for your ${tier} plan. Upgrade to upload larger files.`,
      current: Math.round(fileSizeMB),
      limit: limitMB,
    };
  }

  return { allowed: true };
}

export async function canPerformOperation(
  userId: string,
  tier: SubscriptionTier
): Promise<LimitCheckResult> {
  const limit = TIER_LIMITS[tier].monthlyOperations;

  if (isUnlimited(limit)) {
    return { allowed: true };
  }

  const startOfMonth = getMonthStart();

  const usage = await prisma.usageRecord.findUnique({
    where: { userId_month: { userId, month: startOfMonth } },
  });

  const currentCount = usage?.operationCount ?? 0;

  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `Monthly operation limit of ${limit.toLocaleString()} reached for your ${tier} plan. Upgrade for more operations.`,
      current: currentCount,
      limit,
    };
  }

  return { allowed: true, current: currentCount, limit };
}

function getMonthStart(): Date {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}
