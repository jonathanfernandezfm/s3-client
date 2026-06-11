// src/components/health/health-report.tsx
"use client";

import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CapabilityRow } from "./capability-row";
import { useApplyCorsFix } from "@/lib/queries/health";
import type { HealthReport as HealthReportType } from "@/lib/health/probe";

interface HealthReportViewProps {
  report: HealthReportType;
  endpoint?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function HealthReportView({
  report,
  endpoint,
  onRefresh,
  isRefreshing,
}: HealthReportViewProps) {
  const applyFix = useApplyCorsFix();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Permissions</h2>
          <p className="text-xs text-muted-foreground">
            Last checked {relativeTime(report.checkedAt)}
          </p>
        </div>
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        )}
      </div>

      {report.isStale && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          <AlertTriangle className="h-4 w-4" />
          <span>
            Results are over 7 days old. Refresh to verify current permissions.
          </span>
        </div>
      )}

      {report.connectivity === "unreachable" && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span>
            Couldn&apos;t reach {endpoint ?? "the endpoint"}. Check the URL and
            credentials.
          </span>
        </div>
      )}

      {report.connectivity === "missing-bucket" && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span>
            Bucket {report.bucket} no longer exists at this endpoint.
          </span>
        </div>
      )}

      <Card className="overflow-hidden">
        {report.capabilities.map((cap) => (
          <CapabilityRow
            key={cap.key}
            capability={cap}
            onFix={
              cap.fixAction
                ? () =>
                    applyFix.mutate({
                      connectionId: report.connectionId,
                      bucket: report.bucket!,
                    })
                : undefined
            }
            isFixing={applyFix.isPending}
            fixError={
              applyFix.isError && applyFix.variables?.bucket === report.bucket
                ? (applyFix.error as Error).message
                : undefined
            }
          />
        ))}
      </Card>
    </div>
  );
}
