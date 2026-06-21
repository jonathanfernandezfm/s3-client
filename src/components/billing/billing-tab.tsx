"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes, getTierDisplayName } from "@/lib/subscriptions/tiers";
import { formatNumber } from "@/lib/utils";
import { useUpgradeModalStore } from "@/lib/stores/upgrade-modal-store";
import type { TierConfig } from "@/lib/subscriptions";
import type { SubscriptionTier } from "@/generated/prisma/client";

interface UsageSummary {
  operationCount: number;
  uploadBytes: number;
  downloadBytes: number;
  connectionCount: number;
}

interface BillingTabProps {
  tier: SubscriptionTier;
  limits: TierConfig;
  usage: UsageSummary;
  hasStripeCustomer: boolean;
}

function UsageMeter({
  label,
  current,
  limit,
  formatValue,
}: {
  label: string;
  current: number;
  limit: number;
  formatValue: (n: number) => string;
}) {
  const unlimited = limit === -1 || limit === 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((current / limit) * 100));
  const barColor =
    pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          {formatValue(current)}
          {!unlimited && ` / ${formatValue(limit)}`}
          {unlimited && " (unlimited)"}
        </span>
      </div>
      {!unlimited && (
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div
            className={`h-1.5 rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function BillingTab({ tier, limits, usage, hasStripeCustomer }: BillingTabProps) {
  const [portalLoading, setPortalLoading] = useState(false);
  const openPlansModal = useUpgradeModalStore((s) => s.open);

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        console.error("Portal error:", data.error);
        // TODO: show toast notification
        return;
      }
      if (data.url) window.location.href = data.url;
    } finally {
      setPortalLoading(false);
    }
  }

  const tierLabel = getTierDisplayName(tier);

  return (
    <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
                  Current plan
                </CardTitle>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-2xl font-bold">{tierLabel}</span>
                  <Badge variant="secondary" className="text-xs">Active</Badge>
                </div>
              </div>
              <div className="flex gap-2">
                {tier !== "FREE" && hasStripeCustomer && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManageBilling}
                    disabled={portalLoading}
                  >
                    {portalLoading ? "Loading..." : "Manage billing"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openPlansModal()}
                >
                  View plans
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 border-t pt-4">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              This month
            </p>
            <UsageMeter
              label="Operations"
              current={usage.operationCount}
              limit={limits.monthlyOperations}
              formatValue={formatNumber}
            />
            <UsageMeter
              label="Connections"
              current={usage.connectionCount}
              limit={limits.maxConnections}
              formatValue={(n) => n.toString()}
            />
            <UsageMeter
              label="Uploaded"
              current={usage.uploadBytes}
              limit={-1}
              formatValue={formatBytes}
            />
            <UsageMeter
              label="Downloaded"
              current={usage.downloadBytes}
              limit={-1}
              formatValue={formatBytes}
            />
          </CardContent>
        </Card>

        {usage.connectionCount >= limits.maxConnections && limits.maxConnections !== -1 && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-amber-600 dark:text-amber-400">
            You&apos;ve used all {limits.maxConnections} connections.{" "}
            <button
              className="underline hover:no-underline"
              onClick={() => openPlansModal()}
            >
              {tier === "PRO" ? "Upgrade to Enterprise" : "Upgrade to PRO"}
            </button>{" "}
            to add {tier === "PRO" ? "unlimited" : "up to 10"} connections.
          </div>
        )}
    </div>
  );
}
