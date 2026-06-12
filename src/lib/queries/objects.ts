"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "./keys";
import type { ObjectProperties, S3Object } from "@/types";
import { useInvalidateActivity } from "./activity";
import { useInvalidateNotes } from "./notes";
import { track } from "@/lib/analytics";

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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
      invalidateActivity();
      invalidateNotes();
      track({ name: "files_deleted", props: { count: variables.length } });
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
      track({ name: "folder_created" });
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
      invalidateActivity();
      invalidateNotes();
      track({
        name: "files_copied",
        props: {
          count: variables.sourceKeys.length,
          cross_connection: variables.sourceConnectionId !== variables.targetConnectionId,
        },
      });
    },
  });
}

export function useMoveObjects() {
  const queryClient = useQueryClient();
  const invalidateActivity = useInvalidateActivity();
  const invalidateNotes = useInvalidateNotes();

  return useMutation({
    mutationFn: moveObjects,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
      invalidateActivity();
      invalidateNotes();
      track({
        name: "files_moved",
        props: {
          count: variables.sourceKeys.length,
          cross_connection: variables.sourceConnectionId !== variables.targetConnectionId,
        },
      });
    },
  });
}

async function fetchObjectHead(
  connectionId: string,
  bucket: string,
  key: string
): Promise<ObjectProperties> {
  const response = await fetch("/api/objects/head", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, bucket, key }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch object properties");
  }

  return response.json();
}

export function useObjectHead(
  connectionId: string,
  bucket: string,
  key: string
) {
  return useQuery({
    queryKey: queryKeys.objects.detail(connectionId, bucket, key),
    queryFn: () => fetchObjectHead(connectionId, bucket, key),
    enabled: !!connectionId && !!bucket && !!key,
  });
}

export interface UpdateObjectMetadataParams {
  connectionId: string;
  bucket: string;
  key: string;
  contentType: string;
  cacheControl: string;
  metadata: Record<string, string>;
  storageClass: string;
}

async function updateObjectMetadata(
  params: UpdateObjectMetadataParams
): Promise<{ success: boolean }> {
  const response = await fetch("/api/objects/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update object metadata");
  }

  return response.json();
}

export function useUpdateObjectMetadata() {
  const queryClient = useQueryClient();
  const invalidateActivity = useInvalidateActivity();

  return useMutation({
    mutationFn: updateObjectMetadata,
    onSuccess: () => {
      // objects.all covers both the list and detail keys.
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
      invalidateActivity();
    },
  });
}
