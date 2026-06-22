"use client";

import { useEffect, useMemo, useState } from "react";
import { useAllBuckets, type BucketGroup } from "@/lib/queries/buckets";
import { useWorkspaces, type WorkspaceSummary } from "@/lib/queries/workspaces";
import { BucketCard } from "./bucket-card";
import { CreateBucketDialog } from "./create-bucket-dialog";
import { DeleteBucketDialog } from "./delete-bucket-dialog";
import {
  Loader2,
  AlertCircle,
  CloudOff,
  Server,
  Briefcase,
  Users,
} from "lucide-react";
import { filterNonEmptyWorkspaceGroups } from "./bucket-list-helpers";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePaletteIntentStore } from "@/lib/stores/palette-intent-store";
import { CapabilityGate } from "@/components/health/capability-gate";

interface BucketListProps {
  onOpenBucket?: (
    connectionId: string,
    connectionName: string,
    bucketName: string
  ) => void;
}

export function BucketList({ onOpenBucket }: BucketListProps = {}) {
  const { groups, isLoading, hasAnyConnections } = useAllBuckets();
  const { data: workspaces = [], isLoading: isLoadingWorkspaces } =
    useWorkspaces();
  const [deletingBucket, setDeletingBucket] = useState<{
    name: string;
    connectionId: string;
  } | null>(null);

  const [createBucketForConnection, setCreateBucketForConnection] = useState<
    string | null
  >(null);
  const intent = usePaletteIntentStore((s) => s.intent);
  const consumeIntent = usePaletteIntentStore((s) => s.consumeIntent);

  useEffect(() => {
    if (intent?.kind !== "create-bucket") return;
    consumeIntent();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern; processing palette intent in effect is intentional, real fix tracked separately
    setCreateBucketForConnection(intent.connectionId);
  }, [intent, consumeIntent]);

  const workspaceGroups = useMemo(() => {
    const wsMap = new Map<
      string,
      { workspace: WorkspaceSummary; groups: BucketGroup[] }
    >();
    for (const ws of workspaces) {
      wsMap.set(ws.id, { workspace: ws, groups: [] });
    }
    for (const group of groups) {
      const entry = wsMap.get(group.connection.workspaceId);
      if (entry) {
        entry.groups.push(group);
      }
    }
    return Array.from(wsMap.values());
  }, [workspaces, groups]);

  if (isLoadingWorkspaces || (isLoading && !hasAnyConnections)) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAnyConnections) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CloudOff className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No Connections</h3>
        <p className="text-muted-foreground mb-4">
          Add an S3 connection to view buckets
        </p>
        <Button asChild>
          <Link href="/app/connections">Add Connection</Link>
        </Button>
      </div>
    );
  }

  const getDisplayName = (connection: {
    name?: string | null;
    endpoint: string;
  }) => connection.name || connection.endpoint;

  const visibleWorkspaceGroups = filterNonEmptyWorkspaceGroups(workspaceGroups);

  return (
    <div className="space-y-10">
      {visibleWorkspaceGroups.map(({ workspace, groups: wsGroups }, index) => {
        return (
          <div key={workspace.id} className="space-y-6">
            {index > 0 && <div className="border-t border-border/50" />}
            <div className="flex items-center gap-1.5 min-w-0">
              {workspace.type === "TEAM" ? (
                <Users className="h-3 w-3 text-muted-foreground/70 shrink-0" />
              ) : (
                <Briefcase className="h-3 w-3 text-muted-foreground/70 shrink-0" />
              )}
              <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/70 truncate">
                {workspace.name}
              </span>
              <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/50 shrink-0">
                · {workspace.role}
              </span>
            </div>

            <div className="space-y-8">
              {wsGroups.map((group) => (
                <div
                  key={group.connection.id}
                  id={`connection-${group.connection.id}`}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between gap-2 border-b pb-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Server className="h-5 w-5 text-muted-foreground shrink-0" />
                      <h3 className="text-lg font-semibold truncate min-w-0">
                        {getDisplayName(group.connection)}
                      </h3>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded px-1.5 py-0.5 shrink-0">
                        {group.connection.role}
                      </span>
                      <span className="text-sm text-muted-foreground shrink-0">
                        ({group.buckets.length} bucket
                        {group.buckets.length !== 1 ? "s" : ""})
                      </span>
                    </div>
                    <div className="shrink-0">
                      <CapabilityGate
                        connectionId={group.connection.id}
                        capability="create-buckets"
                      >
                        <CreateBucketDialog
                          connectionId={group.connection.id}
                          disabled={group.connection.role !== "ADMIN"}
                        />
                      </CapabilityGate>
                    </div>
                  </div>

                  {group.isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : group.error ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {group.error.message}
                      </p>
                    </div>
                  ) : group.buckets.length > 0 ? (
                    <div className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
                      {group.buckets.map((bucket) => (
                        <BucketCard
                          key={`${group.connection.id}-${bucket.name}`}
                          bucket={bucket}
                          connectionId={group.connection.id}
                          connectionName={getDisplayName(group.connection)}
                          canDelete={group.connection.role === "ADMIN"}
                          onDelete={(name) =>
                            setDeletingBucket({
                              name,
                              connectionId: group.connection.id,
                            })
                          }
                          onOpen={onOpenBucket}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center border rounded-lg border-dashed">
                      <p className="text-muted-foreground mb-4">
                        No buckets found
                      </p>
                      <CapabilityGate
                        connectionId={group.connection.id}
                        capability="create-buckets"
                      >
                        <CreateBucketDialog
                          connectionId={group.connection.id}
                          disabled={group.connection.role !== "ADMIN"}
                        />
                      </CapabilityGate>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <DeleteBucketDialog
        bucketName={deletingBucket?.name || null}
        connectionId={deletingBucket?.connectionId || null}
        onClose={() => setDeletingBucket(null)}
      />

      {createBucketForConnection && (
        <CreateBucketDialog
          connectionId={createBucketForConnection}
          open={true}
          onOpenChange={(open) => {
            if (!open) setCreateBucketForConnection(null);
          }}
          hideTrigger
        />
      )}
    </div>
  );
}
