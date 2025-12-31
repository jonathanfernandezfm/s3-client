"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnectionStore } from "@/lib/stores/connection-store";
import { queryKeys } from "./keys";
import type { S3Object } from "@/types";

interface ListObjectsResponse {
  objects: S3Object[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

async function fetchObjects(
  connection: unknown,
  bucket: string,
  prefix: string
): Promise<ListObjectsResponse> {
  const response = await fetch("/api/objects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection, bucket, prefix }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch objects");
  }

  return response.json();
}

async function deleteObjects(
  connection: unknown,
  bucket: string,
  keys: string[]
): Promise<{ success: boolean }> {
  const response = await fetch("/api/objects/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection, bucket, keys }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete objects");
  }

  return response.json();
}

async function createFolder(
  connection: unknown,
  bucket: string,
  path: string
): Promise<{ success: boolean }> {
  const response = await fetch("/api/objects/folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection, bucket, path }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create folder");
  }

  return response.json();
}

export function useObjects(bucket: string, prefix: string = "") {
  const { connection, status } = useConnectionStore();

  return useQuery({
    queryKey: queryKeys.objects.list(bucket, prefix),
    queryFn: () => fetchObjects(connection, bucket, prefix),
    enabled: status.connected && !!connection && !!bucket,
  });
}

export function useDeleteObjects(bucket: string) {
  const queryClient = useQueryClient();
  const { connection } = useConnectionStore();

  return useMutation({
    mutationFn: (keys: string[]) => deleteObjects(connection, bucket, keys),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
    },
  });
}

export function useCreateFolder(bucket: string) {
  const queryClient = useQueryClient();
  const { connection } = useConnectionStore();

  return useMutation({
    mutationFn: (path: string) => createFolder(connection, bucket, path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
    },
  });
}
