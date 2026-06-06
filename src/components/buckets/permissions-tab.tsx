"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBucketHealth, useRunBucketHealth } from "@/lib/queries/health";
import { HealthReportView } from "@/components/health/health-report";

interface PermissionsTabProps {
  connectionId: string;
  bucket: string;
}

export function PermissionsTab({ connectionId, bucket }: PermissionsTabProps) {
  const { data: report, isLoading, isError } = useBucketHealth(connectionId, bucket);
  const runHealth = useRunBucketHealth();

  // Lazy-run on first visit: if there's no persisted record (data === null),
  // kick off a POST so the tab populates on the next render.
  useEffect(() => {
    if (!isLoading && !isError && report === null && !runHealth.isPending) {
      runHealth.mutate({ connectionId, bucket });
    }
  }, [isLoading, isError, report, runHealth, connectionId, bucket]);

  if (isLoading || (report === null && runHealth.isPending)) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Running initial permission check…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
        Couldn&apos;t load the report.{" "}
        <Button
          variant="link"
          className="h-auto p-0"
          onClick={() => runHealth.mutate({ connectionId, bucket })}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (report) {
    return (
      <HealthReportView
        report={report}
        onRefresh={() => runHealth.mutate({ connectionId, bucket })}
        isRefreshing={runHealth.isPending}
      />
    );
  }

  return null;
}
