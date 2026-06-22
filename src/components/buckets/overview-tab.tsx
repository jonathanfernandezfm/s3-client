"use client";

import { useConnections } from "@/lib/queries/connections";
import { useBuckets } from "@/lib/queries/buckets";
import { OverviewIdentityCard } from "./overview-identity-card";
import { OverviewStorageStatsCard } from "./overview-storage-stats-card";
import { OverviewActivityCard } from "./overview-activity-card";
import { OverviewIncompleteUploadsCard } from "./overview-incomplete-uploads-card";
import { PermissionsCard } from "@/components/health/permissions-card";
import { OverviewSecurityCard } from "./overview-security-card";

interface OverviewTabProps {
  connectionId: string;
  bucket: string;
}

export function OverviewTab({ connectionId, bucket }: OverviewTabProps) {
  const { data: connections = [] } = useConnections();
  const connection = connections.find((c) => c.id === connectionId);
  // Gates the bucket versioning toggle (infrastructure), not file editing — ADMIN only.
  const canEdit = connection?.role === "ADMIN";

  const { data: bucketsList = [] } = useBuckets(connectionId);
  const bucketMeta = bucketsList.find((b) => b.name === bucket);

  return (
    <div className="space-y-4">
      <OverviewIdentityCard
        connectionId={connectionId}
        bucket={bucket}
        connection={connection}
        bucketMeta={bucketMeta}
        canEdit={!!canEdit}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OverviewStorageStatsCard
          connectionId={connectionId}
          bucket={bucket}
        />
        <OverviewActivityCard connectionId={connectionId} bucket={bucket} />
        <OverviewIncompleteUploadsCard
          connectionId={connectionId}
          bucket={bucket}
        />
        <PermissionsCard connectionId={connectionId} bucket={bucket} />
        <OverviewSecurityCard connectionId={connectionId} bucket={bucket} />
      </div>
    </div>
  );
}
