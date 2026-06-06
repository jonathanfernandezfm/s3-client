"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConnections } from "@/lib/queries/connections";
import {
  useBucketHealth,
  useRunBucketHealth,
} from "@/lib/queries/health";
import { HealthReportView } from "@/components/health/health-report";

interface PageProps {
  params: Promise<{ connectionId: string; bucket: string }>;
}

export default function BucketHealthPage({ params }: PageProps) {
  const { connectionId, bucket } = use(params);
  const decodedBucket = decodeURIComponent(bucket);
  const { data: connections = [] } = useConnections();
  const connection = connections.find((c) => c.id === connectionId);
  const { data: report, isLoading, isError } = useBucketHealth(
    connectionId,
    decodedBucket,
  );
  const runHealth = useRunBucketHealth();

  useEffect(() => {
    if (!isLoading && !isError && report === null && !runHealth.isPending) {
      runHealth.mutate({ connectionId, bucket: decodedBucket });
    }
  }, [isLoading, isError, report, runHealth, connectionId, decodedBucket]);

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-6">
      <div>
        <Link
          href={`/buckets/${connectionId}/${bucket}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to {decodedBucket}
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold">{decodedBucket}</h1>
        <p className="text-sm text-muted-foreground">
          {connection?.name || connection?.endpoint}
        </p>
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
            onClick={() =>
              runHealth.mutate({ connectionId, bucket: decodedBucket })
            }
          >
            Retry
          </Button>
        </div>
      )}

      {report && (
        <HealthReportView
          report={report}
          endpoint={connection?.endpoint}
          onRefresh={() =>
            runHealth.mutate({ connectionId, bucket: decodedBucket })
          }
          isRefreshing={runHealth.isPending}
        />
      )}
    </div>
  );
}
