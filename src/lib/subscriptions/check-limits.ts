import prisma from "@/lib/db/prisma";
import { TIER_LIMITS, isUnlimited } from "./tiers";
import type { SubscriptionTier } from "@/generated/prisma/client";

export type LimitCheckResult = {
  allowed: boolean;
  reason?: string;
  current?: number;
  limit?: number;
};

/**
 * Check if user can create a new connection
 */
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

/**
 * Check if upload size is within tier limits
 */
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

/**
 * Check monthly upload volume
 */
export async function canUploadMonthlyVolume(
  userId: string,
  tier: SubscriptionTier,
  additionalBytes: number
): Promise<LimitCheckResult> {
  const limitGB = TIER_LIMITS[tier].monthlyUploadGB;

  if (isUnlimited(limitGB)) {
    return { allowed: true };
  }

  const limitBytes = limitGB * 1024 * 1024 * 1024;
  const startOfMonth = getMonthStart();

  const usage = await prisma.usageRecord.findUnique({
    where: {
      userId_month: {
        userId,
        month: startOfMonth,
      },
    },
  });

  const currentBytes = Number(usage?.uploadBytes ?? BigInt(0));
  const newTotal = currentBytes + additionalBytes;

  if (newTotal > limitBytes) {
    const currentGB = Math.round(currentBytes / (1024 * 1024 * 1024));
    return {
      allowed: false,
      reason: `Monthly upload limit of ${limitGB}GB reached for your ${tier} plan. Upgrade for more upload volume.`,
      current: currentGB,
      limit: limitGB,
    };
  }

  return { allowed: true };
}

/**
 * Check monthly download volume
 */
export async function canDownloadMonthlyVolume(
  userId: string,
  tier: SubscriptionTier,
  additionalBytes: number
): Promise<LimitCheckResult> {
  const limitGB = TIER_LIMITS[tier].monthlyDownloadGB;

  if (isUnlimited(limitGB)) {
    return { allowed: true };
  }

  const limitBytes = limitGB * 1024 * 1024 * 1024;
  const startOfMonth = getMonthStart();

  const usage = await prisma.usageRecord.findUnique({
    where: {
      userId_month: {
        userId,
        month: startOfMonth,
      },
    },
  });

  const currentBytes = Number(usage?.downloadBytes ?? BigInt(0));
  const newTotal = currentBytes + additionalBytes;

  if (newTotal > limitBytes) {
    const currentGB = Math.round(currentBytes / (1024 * 1024 * 1024));
    return {
      allowed: false,
      reason: `Monthly download limit of ${limitGB}GB reached for your ${tier} plan. Upgrade for more download volume.`,
      current: currentGB,
      limit: limitGB,
    };
  }

  return { allowed: true };
}

/**
 * Check monthly operations limit
 */
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
    where: {
      userId_month: {
        userId,
        month: startOfMonth,
      },
    },
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
