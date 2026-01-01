"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnectionStore } from "@/lib/stores/connection-store";
import { queryKeys } from "./keys";
import type { S3Object, S3Connection } from "@/types";

interface ListObjectsResponse {
  objects: S3Object[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

async function fetchObjects(
  connection: S3Connection,
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
  connection: S3Connection,
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
  connection: S3Connection,
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

export function useObjects(
  connectionId: string,
  bucket: string,
  prefix: string = ""
) {
  const { getConnection, statuses } = useConnectionStore();
  const connection = getConnection(connectionId);
  const status = statuses[connectionId];

  return useQuery({
    queryKey: queryKeys.objects.list(connectionId, bucket, prefix),
    queryFn: () => fetchObjects(connection!, bucket, prefix),
    enabled: !!connection && status?.connected && !!bucket,
  });
}

export function useDeleteObjects(connectionId: string, bucket: string) {
  const queryClient = useQueryClient();
  const { getConnection } = useConnectionStore();

  return useMutation({
    mutationFn: (keys: string[]) => {
      const connection = getConnection(connectionId);
      if (!connection) throw new Error("Connection not found");
      return deleteObjects(connection, bucket, keys);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
    },
  });
}

export function useCreateFolder(connectionId: string, bucket: string) {
  const queryClient = useQueryClient();
  const { getConnection } = useConnectionStore();

  return useMutation({
    mutationFn: (path: string) => {
      const connection = getConnection(connectionId);
      if (!connection) throw new Error("Connection not found");
      return createFolder(connection, bucket, path);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
    },
  });
}
