"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Loader2, ShieldAlert } from "lucide-react";
import { useBucketSecurityPosture } from "@/lib/queries/bucket-security";
import type { SignalState } from "@/lib/s3/security-posture";

interface OverviewSecurityCardProps {
  connectionId: string;
  bucket: string;
}

function stateLabel(state: Exclude<SignalState, "ok">): string {
  switch (state) {
    case "not-configured":
      return "Not configured";
    case "unsupported":
      return "Not reported by this provider";
    case "denied":
      return "No permission to read";
    case "error":
      return "Couldn't read";
  }
}

export function OverviewSecurityCard({
  connectionId,
  bucket,
}: OverviewSecurityCardProps) {
  const { data: posture, isLoading, isError } =
    useBucketSecurityPosture(connectionId, bucket);

  const isWarning = posture?.warnPublic === true;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {isWarning ? (
            <ShieldAlert className="h-5 w-5 text-red-600" />
          ) : (
            <Lock className="h-5 w-5 text-muted-foreground" />
          )}
          Security
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking…
          </div>
        )}
        {isError && (
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t read bucket security settings.
          </p>
        )}
        {!isLoading && !isError && posture && (
          <div className="space-y-2 text-sm">
            {isWarning && (
              <p className="font-semibold text-destructive">
                This bucket is publicly accessible.
              </p>
            )}
            {/* Public Access Block */}
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Public access block</span>
              <span className="text-right">
                {posture.publicAccessBlock.state === "ok"
                  ? posture.publicAccessBlock.fullyBlocked
                    ? "Public access blocked"
                    : "Public access NOT fully blocked"
                  : stateLabel(posture.publicAccessBlock.state)}
              </span>
            </div>
            {/* Bucket Policy */}
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Bucket policy</span>
              <span className="text-right">
                {posture.policy.state === "ok"
                  ? posture.policy.isPublic
                    ? "Bucket is PUBLIC via policy"
                    : "Not public via policy"
                  : posture.policy.state === "not-configured"
                  ? "No bucket policy"
                  : stateLabel(posture.policy.state)}
              </span>
            </div>
            {/* Encryption */}
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Encryption at rest</span>
              <span className="text-right">
                {posture.encryption.state === "ok"
                  ? posture.encryption.algorithm
                    ? `Enabled (${posture.encryption.algorithm})`
                    : "Not enabled"
                  : stateLabel(posture.encryption.state)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
