"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnectionStore } from "@/lib/stores/connection-store";
import { queryKeys } from "./keys";
import type { S3Bucket } from "@/types";

async function fetchBuckets(connection: unknown): Promise<S3Bucket[]> {
  const response = await fetch("/api/buckets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch buckets");
  }

  return response.json();
}

async function createBucket(
  connection: unknown,
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
  connection: unknown,
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

export function useBuckets() {
  const { connection, status } = useConnectionStore();

  return useQuery({
    queryKey: queryKeys.buckets.list(),
    queryFn: () => fetchBuckets(connection),
    enabled: status.connected && !!connection,
  });
}

export function useCreateBucket() {
  const queryClient = useQueryClient();
  const { connection } = useConnectionStore();

  return useMutation({
    mutationFn: (name: string) => createBucket(connection, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.all });
    },
  });
}

export function useDeleteBucket() {
  const queryClient = useQueryClient();
  const { connection } = useConnectionStore();

  return useMutation({
    mutationFn: (name: string) => deleteBucket(connection, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.all });
    },
  });
}
