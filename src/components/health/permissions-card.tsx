// src/components/health/permissions-card.tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
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
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            Running initial permission check…
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (isError || (report === null && !runHealth.isPending)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            Permissions
          </CardTitle>
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
  const permissionsHref = `${pathname}?tab=permissions`;
  const allAvailable = total > 0 && available === total && report.connectivity === "ok";

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          Permissions
        </CardTitle>
        {!allAvailable && (
          <>
            <p className="text-xs text-muted-foreground mt-0.5">
              {available} of {total} available{unavailable > 0 ? ` · ${unavailable} unavailable` : ""}{unsupported > 0 ? ` · ${unsupported} unsupported` : ""}
            </p>
            {report.connectivity !== "ok" && (
              <p className="text-xs text-yellow-600 mt-1">Endpoint unreachable</p>
            )}
          </>
        )}
      </CardHeader>
      <CardContent className="flex flex-col flex-1">
        {allAvailable ? (
          <div className="flex flex-col flex-1 items-center justify-center text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
            <p className="text-sm font-semibold mb-1">All permissions available</p>
            <p className="text-sm text-muted-foreground mb-3">
              All {total} bucket actions are ready to use.
            </p>
            <Link
              href={permissionsHref}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              View permissions
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <Link
            href={permissionsHref}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View permissions
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
