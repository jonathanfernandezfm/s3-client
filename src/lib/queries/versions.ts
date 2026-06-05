"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import type { ListObjectVersionsResponse } from "@/types/s3";
import { useInvalidateActivity } from "./activity";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request to ${url} failed`);
  }
  return res.json();
}

interface ListArgs {
  connectionId: string;
  bucket: string;
  prefix?: string;
  key?: string;
}

export function useObjectVersions(args: ListArgs, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.versions.list(
      args.connectionId,
      args.bucket,
      args.prefix ?? "",
      args.key ?? "",
    ),
    queryFn: () =>
      postJson<ListObjectVersionsResponse>("/api/objects/versions", args),
    enabled:
      (options?.enabled ?? true) && !!args.connectionId && !!args.bucket,
  });
}

export function useVersionPresignUrl(
  args: { connectionId: string; bucket: string; key: string; versionId: string },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.versions.presign(
      args.connectionId,
      args.bucket,
      args.key,
      args.versionId,
    ),
    queryFn: () => postJson<{ url: string }>("/api/objects/versions/presign", args),
    enabled:
      (options?.enabled ?? true) &&
      !!args.connectionId &&
      !!args.bucket &&
      !!args.key &&
      !!args.versionId,
    staleTime: 50 * 60 * 1000,
  });
}

export function useRestoreVersion() {
  const queryClient = useQueryClient();
  const invalidateActivity = useInvalidateActivity();
  return useMutation({
    mutationFn: (vars: {
      connectionId: string;
      bucket: string;
      key: string;
      versionId: string;
    }) => postJson<{ success: true; newVersionId: string }>("/api/objects/versions/restore", vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.versions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
      invalidateActivity();
    },
  });
}

export function useUndeleteVersion() {
  const queryClient = useQueryClient();
  const invalidateActivity = useInvalidateActivity();
  return useMutation({
    mutationFn: (vars: {
      connectionId: string;
      bucket: string;
      key: string;
      deleteMarkerVersionId: string;
    }) => postJson<{ success: true }>("/api/objects/versions/undelete", vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.versions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
      invalidateActivity();
    },
  });
}

export function usePurgeVersion() {
  const queryClient = useQueryClient();
  const invalidateActivity = useInvalidateActivity();
  return useMutation({
    mutationFn: (vars: {
      connectionId: string;
      bucket: string;
      key: string;
      versionId: string;
    }) => postJson<{ success: true }>("/api/objects/versions/purge", vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.versions.all });
      invalidateActivity();
    },
  });
}

export function useCopyVersion() {
  const queryClient = useQueryClient();
  const invalidateActivity = useInvalidateActivity();
  return useMutation({
    mutationFn: (vars: {
      connectionId: string;
      bucket: string;
      key: string;
      versionId: string;
      targetConnectionId: string;
      targetBucket: string;
      targetKey: string;
    }) => postJson<{ success: true }>("/api/objects/versions/copy", vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
      invalidateActivity();
    },
  });
}
