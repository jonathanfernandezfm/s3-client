"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConnections } from "@/lib/queries/connections";
import {
  useConnectionHealth,
  useRunConnectionHealth,
} from "@/lib/queries/health";
import { HealthReportView } from "@/components/health/health-report";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ConnectionHealthPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: connections = [] } = useConnections();
  const connection = connections.find((c) => c.id === id);
  const { data: report, isLoading, isError } = useConnectionHealth(id);
  const runHealth = useRunConnectionHealth();

  // If no persisted report and not currently running, kick one off.
  useEffect(() => {
    if (!isLoading && !isError && report === null && !runHealth.isPending) {
      runHealth.mutate({ connectionId: id });
    }
  }, [isLoading, isError, report, runHealth, id]);

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-6">
      <div>
        <Link
          href="/connections"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Connections
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold">
          {connection?.name || connection?.endpoint || "Connection"}
        </h1>
        <p className="text-sm text-muted-foreground">{connection?.endpoint}</p>
      </div>

      {(isLoading || (report === null && runHealth.isPending)) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Running initial permission check…
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Couldn&apos;t load the report.{" "}
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => runHealth.mutate({ connectionId: id })}
          >
            Retry
          </Button>
        </div>
      )}

      {report && (
        <HealthReportView
          report={report}
          endpoint={connection?.endpoint}
          onRefresh={() => runHealth.mutate({ connectionId: id })}
          isRefreshing={runHealth.isPending}
        />
      )}
    </div>
  );
}
