"use client";

import { useState } from "react";
import { useBuckets } from "@/lib/queries/buckets";
import { useConnectionStore } from "@/lib/stores/connection-store";
import { BucketCard } from "./bucket-card";
import { CreateBucketDialog } from "./create-bucket-dialog";
import { DeleteBucketDialog } from "./delete-bucket-dialog";
import { Loader2, AlertCircle, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function BucketList() {
  const { status } = useConnectionStore();
  const { data: buckets, isLoading, error, refetch } = useBuckets();
  const [deletingBucket, setDeletingBucket] = useState<string | null>(null);

  if (!status.connected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CloudOff className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No Connection</h3>
        <p className="text-muted-foreground mb-4">
          Connect to an S3 endpoint to view buckets
        </p>
        <Button asChild>
          <Link href="/settings/connections">Configure Connection</Link>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold">Failed to load buckets</h3>
        <p className="text-muted-foreground mb-4">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">
            {buckets?.length || 0} Bucket{buckets?.length !== 1 ? "s" : ""}
          </h2>
        </div>
        <CreateBucketDialog />
      </div>

      {buckets && buckets.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {buckets.map((bucket) => (
            <BucketCard
              key={bucket.name}
              bucket={bucket}
              onDelete={setDeletingBucket}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg">
          <p className="text-muted-foreground mb-4">No buckets found</p>
          <CreateBucketDialog />
        </div>
      )}

      <DeleteBucketDialog
        bucketName={deletingBucket}
        onClose={() => setDeletingBucket(null)}
      />
    </div>
  );
}
