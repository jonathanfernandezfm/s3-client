import type { SubscriptionTier } from "@/generated/prisma/client";

export interface TeamLimits {
  enabled: boolean;
  maxTeams: number;       // -1 = unlimited
  maxMembersPerTeam: number; // -1 = unlimited
}

export interface TierConfig {
  maxConnections: number;
  maxUploadSizeMB: number;
  monthlyOperations: number;
  shareLinks: boolean;
  teams: TeamLimits;
  activityRetentionDays: number; // -1 = unlimited
}

export const TIER_LIMITS: Record<SubscriptionTier, TierConfig> = {
  FREE: {
    maxConnections: 2,
    maxUploadSizeMB: 50,
    monthlyOperations: 1000,
    shareLinks: false,
    teams: { enabled: false, maxTeams: 0, maxMembersPerTeam: 0 },
    activityRetentionDays: 30,
  },
  PRO: {
    maxConnections: 10,
    maxUploadSizeMB: -1,
    monthlyOperations: 50000,
    shareLinks: true,
    teams: { enabled: true, maxTeams: 1, maxMembersPerTeam: 5 },
    activityRetentionDays: 90,
  },
  ENTERPRISE: {
    maxConnections: -1,
    maxUploadSizeMB: -1,
    monthlyOperations: -1,
    shareLinks: true,
    teams: { enabled: true, maxTeams: -1, maxMembersPerTeam: -1 },
    activityRetentionDays: -1,
  },
};

export type TierLimits = TierConfig;

export function getTierLimits(tier: SubscriptionTier): TierConfig {
  return TIER_LIMITS[tier];
}

export function isUnlimited(limit: number): boolean {
  return limit === -1;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function getTierDisplayName(tier: SubscriptionTier): string {
  const names: Record<SubscriptionTier, string> = {
    FREE: "Free",
    PRO: "Pro",
    ENTERPRISE: "Enterprise",
  };
  return names[tier];
}
