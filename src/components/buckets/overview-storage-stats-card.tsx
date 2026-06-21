"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { formatBytes, formatNumber } from "@/lib/utils";
import { useBucketStats } from "@/lib/queries/buckets";

interface OverviewStorageStatsCardProps {
  connectionId: string;
  bucket: string;
}

export function OverviewStorageStatsCard({
  connectionId,
  bucket,
}: OverviewStorageStatsCardProps) {
  const stats = useBucketStats(connectionId, bucket);
  const hasData = !!stats.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          Storage stats
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats.isError && (
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              {(stats.error as Error)?.message ?? "Failed to compute stats."}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => stats.refetch()}
            >
              Retry
            </Button>
          </div>
        )}

        {!stats.isError && !hasData && !stats.isFetching && (
          <>
            <p className="text-sm text-muted-foreground">
              Counts all objects in the bucket and totals their size. May take a
              while on large buckets — does not run automatically.
            </p>
            <Button
              size="sm"
              variant="default"
              onClick={() => stats.refetch()}
            >
              Compute stats
            </Button>
          </>
        )}

        {stats.isFetching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Counting objects…
          </div>
        )}

        {hasData && !stats.isFetching && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Objects
                </div>
                <div className="text-2xl font-semibold">
                  {formatNumber(stats.data.objectCount)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Total size
                </div>
                <div className="text-2xl font-semibold">
                  {formatBytes(stats.data.totalSize)}
                </div>
              </div>
            </div>

            {stats.data.storageClasses.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-2">Storage class</th>
                      <th className="p-2 text-right">Count</th>
                      <th className="p-2 text-right">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.data.storageClasses.map((row) => (
                      <tr key={row.class} className="border-t">
                        <td className="p-2 font-mono text-xs">{row.class}</td>
                        <td className="p-2 text-right">
                          {formatNumber(row.count)}
                        </td>
                        <td className="p-2 text-right">
                          {formatBytes(row.size)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => stats.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
