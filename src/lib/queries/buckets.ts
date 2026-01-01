"use client";

import { useMutation, useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import { useConnectionStore } from "@/lib/stores/connection-store";
import { queryKeys } from "./keys";
import type { S3Bucket, S3Connection } from "@/types";

async function fetchBuckets(connection: S3Connection): Promise<S3Bucket[]> {
  const response = await fetch("/api/buckets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch buckets");
  }

  const buckets = await response.json();
  return buckets.map((bucket: Omit<S3Bucket, "connectionId">) => ({
    ...bucket,
    connectionId: connection.id,
  }));
}

async function createBucket(
  connection: S3Connection,
  name: string
): Promise<{ success: boolean }> {
  const response = await fetch("/api/buckets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection, name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create bucket");
  }

  return response.json();
}

async function deleteBucket(
  connection: S3Connection,
  name: string
): Promise<{ success: boolean }> {
  const response = await fetch(`/api/buckets/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete bucket");
  }

  return response.json();
}

export function useBuckets(connectionId: string) {
  const { getConnection, statuses } = useConnectionStore();
  const connection = getConnection(connectionId);
  const status = statuses[connectionId];

  return useQuery({
    queryKey: queryKeys.buckets.byConnection(connectionId),
    queryFn: () => fetchBuckets(connection!),
    enabled: !!connection && status?.connected,
  });
}

export interface BucketGroup {
  connection: S3Connection;
  buckets: S3Bucket[];
  isLoading: boolean;
  error: Error | null;
}

export function useAllBuckets(): {
  groups: BucketGroup[];
  isLoading: boolean;
  hasAnyConnected: boolean;
} {
  const { connections, statuses } = useConnectionStore();

  const connectedConnections = connections.filter(
    (conn) => statuses[conn.id]?.connected
  );

  const queries = useQueries({
    queries: connectedConnections.map((connection) => ({
      queryKey: queryKeys.buckets.byConnection(connection.id),
      queryFn: () => fetchBuckets(connection),
      enabled: true,
    })),
  });

  const groups: BucketGroup[] = connectedConnections.map((connection, index) => ({
    connection,
    buckets: queries[index]?.data || [],
    isLoading: queries[index]?.isLoading || false,
    error: queries[index]?.error as Error | null,
  }));

  const isLoading = queries.some((q) => q.isLoading);
  const hasAnyConnected = connectedConnections.length > 0;

  return { groups, isLoading, hasAnyConnected };
}

export function useCreateBucket(connectionId: string) {
  const queryClient = useQueryClient();
  const { getConnection } = useConnectionStore();

  return useMutation({
    mutationFn: (name: string) => {
      const connection = getConnection(connectionId);
      if (!connection) throw new Error("Connection not found");
      return createBucket(connection, name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.all });
    },
  });
}

export function useDeleteBucket(connectionId: string) {
  const queryClient = useQueryClient();
  const { getConnection } = useConnectionStore();

  return useMutation({
    mutationFn: (name: string) => {
      const connection = getConnection(connectionId);
      if (!connection) throw new Error("Connection not found");
      return deleteBucket(connection, name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.all });
    },
  });
}
