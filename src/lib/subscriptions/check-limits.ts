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
      reason: `Monthly operation limit of ${limit.toLocaleString("en-US")} reached for your ${tier} plan. Upgrade for more operations.`,
      current: currentCount,
      limit,
    };
  }

  return { allowed: true, current: currentCount, limit };
}

export async function canCreateTeam(
  userId: string,
  tier: SubscriptionTier
): Promise<LimitCheckResult> {
  const limit = TIER_LIMITS[tier].teams.maxTeams;

  if (isUnlimited(limit)) {
    return { allowed: true };
  }

  if (limit === 0) {
    return {
      allowed: false,
      reason: `Teams are not available on your ${tier} plan. Upgrade to PRO to create teams.`,
      current: 0,
      limit: 0,
    };
  }

  const count = await prisma.team.count({
    where: { createdById: userId },
  });

  if (count >= limit) {
    return {
      allowed: false,
      reason: `You have reached the maximum of ${limit} team${limit === 1 ? "" : "s"} for your ${tier} plan. Upgrade to add more teams.`,
      current: count,
      limit,
    };
  }

  return { allowed: true, current: count, limit };
}

export async function canAddTeamMember(
  teamId: string
): Promise<LimitCheckResult> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      createdBy: { include: { subscription: true } },
      _count: { select: { members: true } },
    },
  });

  if (!team) {
    return {
      allowed: false,
      reason: "Team not found.",
    };
  }

  const tier: SubscriptionTier = team.createdBy.subscription?.tier ?? "FREE";
  const limit = TIER_LIMITS[tier].teams.maxMembersPerTeam;

  if (isUnlimited(limit)) {
    return { allowed: true };
  }

  if (limit === 0) {
    return {
      allowed: false,
      reason: `Teams are not available on the team creator's ${tier} plan.`,
      current: team._count.members,
      limit: 0,
    };
  }

  const currentCount = team._count.members;

  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `This team has reached the maximum of ${limit} member${limit === 1 ? "" : "s"} for a ${tier} plan. Upgrade to add more members.`,
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
