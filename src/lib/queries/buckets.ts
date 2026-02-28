"use client";

import { useMutation, useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import { useConnections, type ConnectionResponse } from "./connections";
import { queryKeys } from "./keys";
import type { S3Bucket } from "@/types";

async function fetchBuckets(connectionId: string): Promise<S3Bucket[]> {
  const response = await fetch("/api/buckets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch buckets");
  }

  const buckets = await response.json();
  return buckets.map((bucket: Omit<S3Bucket, "connectionId">) => ({
    ...bucket,
    connectionId,
  }));
}

async function createBucket(
  connectionId: string,
  name: string
): Promise<{ success: boolean }> {
  const response = await fetch("/api/buckets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create bucket");
  }

  return response.json();
}

async function deleteBucket(
  connectionId: string,
  name: string
): Promise<{ success: boolean }> {
  const response = await fetch(`/api/buckets/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete bucket");
  }

  return response.json();
}

export function useBuckets(connectionId: string) {
  return useQuery({
    queryKey: queryKeys.buckets.byConnection(connectionId),
    queryFn: () => fetchBuckets(connectionId),
    enabled: !!connectionId,
  });
}

export interface BucketGroup {
  connection: ConnectionResponse;
  buckets: S3Bucket[];
  isLoading: boolean;
  error: Error | null;
}

export function useAllBuckets(): {
  groups: BucketGroup[];
  isLoading: boolean;
  hasAnyConnections: boolean;
} {
  const { data: connections = [], isLoading: isConnectionsLoading } = useConnections();

  const queries = useQueries({
    queries: connections.map((connection) => ({
      queryKey: queryKeys.buckets.byConnection(connection.id),
      queryFn: () => fetchBuckets(connection.id),
      enabled: true,
    })),
  });

  const groups: BucketGroup[] = connections.map((connection, index) => ({
    connection,
    buckets: queries[index]?.data || [],
    isLoading: queries[index]?.isLoading || false,
    error: queries[index]?.error as Error | null,
  }));

  const isLoading = isConnectionsLoading || queries.some((q) => q.isLoading);
  const hasAnyConnections = connections.length > 0;

  return { groups, isLoading, hasAnyConnections };
}

export function useCreateBucket(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => createBucket(connectionId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.all });
    },
  });
}

export function useDeleteBucket(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => deleteBucket(connectionId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.all });
    },
  });
}
