// src/components/health/permissions-card.tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Minus,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useBucketHealth,
  useRunBucketHealth,
} from "@/lib/queries/health";
import type { CapabilityStatus } from "@/lib/health/probe";

function StatusIcon({ status }: { status: CapabilityStatus }) {
  switch (status) {
    case "available":
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
    case "unavailable":
      return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    case "unsupported":
      return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
    case "untested":
      return <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />;
    default:
      return <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

interface PermissionsCardProps {
  connectionId: string;
  bucket: string;
}

export function PermissionsCard({ connectionId, bucket }: PermissionsCardProps) {
  const { data: report, isLoading, isError } = useBucketHealth(
    connectionId,
    bucket,
  );
  const runHealth = useRunBucketHealth();

  // Lazy-run on first visit: if there's no persisted record (data === null),
  // kick off a POST so the card populates on the next render.
  useEffect(() => {
    if (!isLoading && !isError && report === null && !runHealth.isPending) {
      runHealth.mutate({ connectionId, bucket });
    }
  }, [isLoading, isError, report, runHealth, connectionId, bucket]);

  if (isLoading || (report === null && runHealth.isPending)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Running initial permission check…
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (isError || (report === null && !runHealth.isPending)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-2">
            Couldn&apos;t complete the permission check.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runHealth.mutate({ connectionId, bucket })}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!report) return null;

  const available = report.capabilities.filter(
    (c) => c.status === "available",
  ).length;
  const unavailable = report.capabilities.filter(
    (c) => c.status === "unavailable",
  ).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-sm">Permissions</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {available} of {report.capabilities.length} available
              {unavailable > 0 ? ` · ${unavailable} unavailable` : ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => runHealth.mutate({ connectionId, bucket })}
            disabled={runHealth.isPending}
            title="Refresh permissions"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${runHealth.isPending ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {report.capabilities.map((cap) => (
          <div key={cap.key} className="flex items-center gap-2 text-sm">
            <StatusIcon status={cap.status} />
            <span className="text-muted-foreground">{cap.label}</span>
          </div>
        ))}
        <div className="pt-2">
          <Link
            href={`/buckets/${connectionId}/${encodeURIComponent(bucket)}/health`}
            className="text-xs text-primary hover:underline"
          >
            View full report →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
