"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import type { S3Object } from "@/types";
import { useInvalidateActivity } from "./activity";

interface ListObjectsResponse {
  objects: S3Object[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

interface CopyMoveResult {
  sourceKey: string;
  targetKey: string;
  success: boolean;
  error?: string;
}

interface CopyMoveResponse {
  results: CopyMoveResult[];
  summary: { total: number; successful: number; failed: number };
}

interface CopyMoveParams {
  sourceConnectionId: string;
  sourceBucket: string;
  sourceKeys: string[];
  targetConnectionId: string;
  targetBucket: string;
  targetPath: string;
}

async function fetchObjects(
  connectionId: string,
  bucket: string,
  prefix: string
): Promise<ListObjectsResponse> {
  const response = await fetch("/api/objects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, bucket, prefix }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch objects");
  }

  return response.json();
}

async function deleteObjects(
  connectionId: string,
  bucket: string,
  keys: string[]
): Promise<{ success: boolean }> {
  const response = await fetch("/api/objects/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, bucket, keys }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete objects");
  }

  return response.json();
}

async function createFolder(
  connectionId: string,
  bucket: string,
  path: string
): Promise<{ success: boolean }> {
  const response = await fetch("/api/objects/folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, bucket, path }),
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
  return useQuery({
    queryKey: queryKeys.objects.list(connectionId, bucket, prefix),
    queryFn: () => fetchObjects(connectionId, bucket, prefix),
    enabled: !!connectionId && !!bucket,
  });
}

export function useDeleteObjects(connectionId: string, bucket: string) {
  const queryClient = useQueryClient();
  const invalidateActivity = useInvalidateActivity();

  return useMutation({
    mutationFn: (keys: string[]) => deleteObjects(connectionId, bucket, keys),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
      invalidateActivity();
    },
  });
}

export function useCreateFolder(connectionId: string, bucket: string) {
  const queryClient = useQueryClient();
  const invalidateActivity = useInvalidateActivity();

  return useMutation({
    mutationFn: (path: string) => createFolder(connectionId, bucket, path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
      invalidateActivity();
    },
  });
}

async function copyObjects(params: CopyMoveParams): Promise<CopyMoveResponse> {
  const response = await fetch("/api/objects/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to copy objects");
  }

  return response.json();
}

async function moveObjects(params: CopyMoveParams): Promise<CopyMoveResponse> {
  const response = await fetch("/api/objects/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to move objects");
  }

  return response.json();
}

export function useCopyObjects() {
  const queryClient = useQueryClient();
  const invalidateActivity = useInvalidateActivity();

  return useMutation({
    mutationFn: copyObjects,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
      invalidateActivity();
    },
  });
}

export function useMoveObjects() {
  const queryClient = useQueryClient();
  const invalidateActivity = useInvalidateActivity();

  return useMutation({
    mutationFn: moveObjects,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
      invalidateActivity();
    },
  });
}
