"use client";

import { useState } from "react";
import { useAllBuckets } from "@/lib/queries/buckets";
import { useWorkspaces } from "@/lib/queries/workspaces";
import { BucketCard } from "./bucket-card";
import { CreateBucketDialog } from "./create-bucket-dialog";
import { DeleteBucketDialog } from "./delete-bucket-dialog";
import { Loader2, AlertCircle, CloudOff, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface BucketListProps {
  onOpenBucket?: (connectionId: string, connectionName: string, bucketName: string) => void;
}

export function BucketList({ onOpenBucket }: BucketListProps = {}) {
  const { groups, isLoading, hasAnyConnections } = useAllBuckets();
  const { selectedWorkspace, isLoading: isLoadingWorkspaces } = useWorkspaces();
  const [deletingBucket, setDeletingBucket] = useState<{
    name: string;
    connectionId: string;
  } | null>(null);

  if (isLoadingWorkspaces || !selectedWorkspace || (isLoading && !hasAnyConnections)) {
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
          <Link href="/connections">Add Connection</Link>
        </Button>
      </div>
    );
  }

  if (isLoading && groups.every((g) => g.buckets.length === 0)) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getDisplayName = (connection: { name?: string | null; endpoint: string }) => {
    return connection.name || connection.endpoint;
  };

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.connection.id} className="space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">
                {getDisplayName(group.connection)}
              </h2>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded px-1.5 py-0.5">
                {group.connection.role}
              </span>
              <span className="text-sm text-muted-foreground">
                ({group.buckets.length} bucket
                {group.buckets.length !== 1 ? "s" : ""})
              </span>
            </div>
            <CreateBucketDialog
              connectionId={group.connection.id}
              disabled={group.connection.role !== "ADMIN"}
            />
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
              <p className="text-muted-foreground mb-4">No buckets found</p>
              <CreateBucketDialog
                connectionId={group.connection.id}
                disabled={group.connection.role !== "ADMIN"}
              />
            </div>
          )}
        </div>
      ))}

      <DeleteBucketDialog
        bucketName={deletingBucket?.name || null}
        connectionId={deletingBucket?.connectionId || null}
        onClose={() => setDeletingBucket(null)}
      />
    </div>
  );
}
