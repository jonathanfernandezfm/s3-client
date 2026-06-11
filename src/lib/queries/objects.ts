"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "./keys";
import type { S3Object } from "@/types";
import { useInvalidateActivity } from "./activity";
import { useInvalidateNotes } from "./notes";

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
  prefix: string,
  continuationToken?: string
): Promise<ListObjectsResponse> {
  const response = await fetch("/api/objects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, bucket, prefix, continuationToken }),
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
  const query = useInfiniteQuery({
    queryKey: queryKeys.objects.list(connectionId, bucket, prefix),
    queryFn: ({ pageParam }) =>
      fetchObjects(connectionId, bucket, prefix, pageParam),
    getNextPageParam: (lastPage) =>
      lastPage.isTruncated ? lastPage.nextContinuationToken : undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!connectionId && !!bucket,
  });

  const objects = query.data?.pages.flatMap((p) => p.objects) ?? [];

  return {
    objects,
    hasMore: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
  };
}

export function useDeleteObjects(connectionId: string, bucket: string) {
  const queryClient = useQueryClient();
  const invalidateActivity = useInvalidateActivity();
  const invalidateNotes = useInvalidateNotes();

  return useMutation({
    mutationFn: (keys: string[]) => deleteObjects(connectionId, bucket, keys),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
      invalidateActivity();
      invalidateNotes();
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
  const invalidateNotes = useInvalidateNotes();

  return useMutation({
    mutationFn: copyObjects,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
      invalidateActivity();
      invalidateNotes();
    },
  });
}

export function useMoveObjects() {
  const queryClient = useQueryClient();
  const invalidateActivity = useInvalidateActivity();
  const invalidateNotes = useInvalidateNotes();

  return useMutation({
    mutationFn: moveObjects,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
      invalidateActivity();
      invalidateNotes();
    },
  });
}
