"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConnections } from "@/lib/queries/connections";
import {
  useConnectionHealth,
  useRunConnectionHealth,
} from "@/lib/queries/health";
import { HealthReportView } from "@/components/health/health-report";

interface ConnectionPermissionsTabProps {
  connectionId: string;
}

export function ConnectionPermissionsTab({
  connectionId,
}: ConnectionPermissionsTabProps) {
  const { data: connections = [] } = useConnections();
  const connection = connections.find((c) => c.id === connectionId);
  const { data: report, isLoading, isError } = useConnectionHealth(connectionId);
  const runHealth = useRunConnectionHealth();

  useEffect(() => {
    if (!isLoading && !isError && report === null && !runHealth.isPending) {
      runHealth.mutate({ connectionId });
    }
  }, [isLoading, isError, report, runHealth, connectionId]);

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
          onClick={() => runHealth.mutate({ connectionId })}
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
        endpoint={connection?.endpoint}
        onRefresh={() => runHealth.mutate({ connectionId })}
        isRefreshing={runHealth.isPending}
      />
    );
  }

  return null;
}
