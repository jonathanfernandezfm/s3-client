"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Database } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { useBucketVersioning, useSetBucketVersioning } from "@/lib/queries/buckets";
import { getVersioningControl } from "@/lib/buckets/versioning-ui";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { CapabilityGate } from "@/components/health/capability-gate";
import type { ConnectionResponse } from "@/lib/queries/connections";
import type { S3Bucket } from "@/types";

interface OverviewIdentityCardProps {
  connectionId: string;
  bucket: string;
  connection: ConnectionResponse | undefined;
  bucketMeta: S3Bucket | undefined;
  canEdit: boolean;
}

function Row({
  label,
  value,
  className,
  labelClassName,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 py-1.5", className)}>
      <dt
        className={cn(
          "text-xs uppercase tracking-wider text-muted-foreground w-32 shrink-0",
          labelClassName,
        )}
      >
        {label}
      </dt>
      <dd className={cn("text-sm min-w-0 flex-1", valueClassName ?? "truncate")}>
        {value}
      </dd>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  Enabled: "border-green-500/30 bg-green-500/15 text-green-600",
  Suspended: "border-yellow-500/30 bg-yellow-500/15 text-yellow-600",
  Disabled: "border-border bg-muted text-muted-foreground",
};

export function OverviewIdentityCard({
  connectionId,
  bucket,
  connection,
  bucketMeta,
  canEdit,
}: OverviewIdentityCardProps) {
  const connectionLabel =
    connection?.name || connection?.endpoint || "Unknown connection";
  const versioning = useBucketVersioning(connectionId, bucket);
  const setVersioning = useSetBucketVersioning(connectionId, bucket);
  const status = versioning.data?.status ?? "Disabled";
  const control = getVersioningControl(status, canEdit, setVersioning.isPending);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const handleVersioningChange = () => {
    if (!control) return;

    setVersioning.mutate(control.enabled, {
      onSuccess: () =>
        addNotification({
          type: "info",
          title: control.enabled ? "Versioning enabled." : "Versioning suspended.",
          status: "completed",
        }),
      onError: (e) =>
        addNotification({
          type: "error",
          title: control.enabled ? "Failed to enable" : "Failed to suspend",
          error: (e as Error).message,
          status: "error",
        }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-muted-foreground" />
          <span className="font-mono truncate">{bucket}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl>
          <Row
            label="Connection"
            value={
              connection ? (
                <Link
                  href={`/app/connections#connection-${connection.id}`}
                  className="hover:underline"
                >
                  {connectionLabel}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            }
          />
          <Row
            label="Region"
            value={
              connection?.region ? (
                connection.region
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )
            }
          />
          <Row
            label="Endpoint"
            value={
              connection?.endpoint ? (
                <span className="block font-mono text-xs truncate">
                  {connection.endpoint}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            }
          />
          <Row
            label="Created"
            value={
              bucketMeta?.creationDate ? (
                formatDate(bucketMeta.creationDate)
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )
            }
          />
          <Row
            label="Versioning"
            className="items-center py-1"
            labelClassName="leading-6"
            valueClassName="min-w-0"
            value={
              versioning.isError ? (
                <span className="text-muted-foreground">
                  Failed to load.{" "}
                  <button
                    type="button"
                    onClick={() => versioning.refetch()}
                    className="text-foreground underline"
                  >
                    Retry
                  </button>
                </span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "h-6 px-2",
                      STATUS_BADGE[status] ?? "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {status}
                  </Badge>
                  {versioning.isLoading && (
                    <span className="text-xs text-muted-foreground">Loading…</span>
                  )}
                  {control ? (
                    <CapabilityGate
                      connectionId={connectionId}
                      bucket={bucket}
                      capability="manage-versioning"
                    >
                      <Button
                        type="button"
                        size="sm"
                        variant={control.enabled ? "default" : "outline"}
                        className="h-6 px-2 text-xs"
                        disabled={control.disabled}
                        onClick={handleVersioningChange}
                      >
                        {control.label}
                      </Button>
                    </CapabilityGate>
                  ) : (
                    <span className="text-xs text-muted-foreground">Read only</span>
                  )}
                </div>
              )
            }
          />
        </dl>
      </CardContent>
    </Card>
  );
}
