// src/components/health/permissions-card.tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useBucketHealth,
  useRunBucketHealth,
} from "@/lib/queries/health";

interface PermissionsCardProps {
  connectionId: string;
  bucket: string;
}

export function PermissionsCard({ connectionId, bucket }: PermissionsCardProps) {
  const pathname = usePathname();
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

  const available = report.capabilities.filter((c) => c.status === "available").length;
  const unavailable = report.capabilities.filter((c) => c.status === "unavailable").length;
  const unsupported = report.capabilities.filter((c) => c.status === "unsupported").length;
  const total = report.capabilities.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Permissions</CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          {available} of {total} available{unavailable > 0 ? ` · ${unavailable} unavailable` : ""}{unsupported > 0 ? ` · ${unsupported} unsupported` : ""}
        </p>
        {report.connectivity !== "ok" && (
          <p className="text-xs text-yellow-600 mt-1">Endpoint unreachable</p>
        )}
      </CardHeader>
      <CardContent>
        <Link href={`${pathname}?tab=permissions`} className="text-xs text-primary hover:underline">
          View permissions →
        </Link>
      </CardContent>
    </Card>
  );
}
