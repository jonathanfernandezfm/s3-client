"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBucketVersioning, useSetBucketVersioning } from "@/lib/queries/buckets";
import { toast } from "@/hooks/use-toast";
import { CapabilityGate } from "@/components/health/capability-gate";

interface OverviewVersioningCardProps {
  connectionId: string;
  bucket: string;
  canEdit: boolean;
}

const STATUS_PILL: Record<string, string> = {
  Enabled: "bg-green-500/15 text-green-600 border-green-500/30",
  Suspended: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  Disabled: "bg-muted text-muted-foreground border-border",
};

const STATUS_EXPLAINER: Record<string, string> = {
  Enabled:
    "New uploads create a new version. Deletes leave a delete marker. Older versions stay until purged.",
  Suspended:
    "New uploads overwrite the current version. Existing versions are preserved.",
  Disabled:
    "Versioning has never been turned on. Once enabled it can be suspended but not turned off.",
};

export function OverviewVersioningCard({
  connectionId,
  bucket,
  canEdit,
}: OverviewVersioningCardProps) {
  const versioning = useBucketVersioning(connectionId, bucket);
  const setVersioning = useSetBucketVersioning(connectionId, bucket);

  const status = versioning.data?.status ?? "Disabled";
  const isPending = setVersioning.isPending;

  const handleEnable = () =>
    setVersioning.mutate(true, {
      onSuccess: () => toast({ title: "Versioning enabled." }),
      onError: (e) =>
        toast({
          title: "Failed to enable",
          description: (e as Error).message,
        }),
    });

  const handleSuspend = () =>
    setVersioning.mutate(false, {
      onSuccess: () => toast({ title: "Versioning suspended." }),
      onError: (e) =>
        toast({
          title: "Failed to suspend",
          description: (e as Error).message,
        }),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          Versioning
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {versioning.isError ? (
          <div className="text-sm text-muted-foreground">
            Failed to load versioning status.{" "}
            <button
              type="button"
              onClick={() => versioning.refetch()}
              className="text-foreground underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                  STATUS_PILL[status] ?? "bg-muted text-muted-foreground border-border",
                )}
              >
                {status}
              </span>
              {versioning.isLoading && (
                <span className="text-xs text-muted-foreground">Loading…</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {STATUS_EXPLAINER[status] ?? "Versioning status unknown."}
            </p>
            {canEdit ? (
              <div className="flex items-center gap-2">
                <CapabilityGate connectionId={connectionId} bucket={bucket} capability="manage-versioning">
                  <Button
                    size="sm"
                    variant="default"
                    disabled={status === "Enabled" || isPending}
                    onClick={handleEnable}
                  >
                    Enable
                  </Button>
                </CapabilityGate>
                <CapabilityGate connectionId={connectionId} bucket={bucket} capability="manage-versioning">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={status !== "Enabled" || isPending}
                    onClick={handleSuspend}
                  >
                    Suspend
                  </Button>
                </CapabilityGate>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Viewer — read only
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
