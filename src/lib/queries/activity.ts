"use client";

import {
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "./keys";
import type { ActivityAction } from "@/generated/prisma/client";

export type ActivityEventResponse = {
  id: string;
  userId: string | null;
  userDisplayName: string;
  userImageUrl: string | null;
  action: ActivityAction;
  bucket: string;
  key: string | null;
  targetKey: string | null;
  byteSize: string | null;
  batchId: string | null;
  createdAt: string;
};

type ActivityResponse = {
  events: ActivityEventResponse[];
  nextCursor: string | null;
};

export type ActivityScope = {
  connectionId: string;
  bucket: string;
  prefix?: string;
  key?: string;
  userId?: string;
  actions?: ActivityAction[];
};

async function fetchActivity(scope: ActivityScope, cursor?: string): Promise<ActivityResponse> {
  const params = new URLSearchParams({
    connectionId: scope.connectionId,
    bucket: scope.bucket,
  });
  if (scope.prefix) params.set("prefix", scope.prefix);
  if (scope.key) params.set("key", scope.key);
  if (scope.userId) params.set("userId", scope.userId);
  if (scope.actions?.length) params.set("actions", scope.actions.join(","));
  if (cursor) params.set("cursor", cursor);

  const response = await fetch(`/api/activity?${params.toString()}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch activity");
  }
  return response.json();
}

export function useActivity(scope: ActivityScope) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.activity.list(scope.connectionId, scope.bucket, scope.prefix, scope.key),
    queryFn: ({ pageParam }) => fetchActivity(scope, pageParam as string | undefined),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!scope.connectionId && !!scope.bucket,
    staleTime: 60_000,
  });

  const events = query.data?.pages.flatMap((p) => p.events) ?? [];
  const hasMore = !!query.data?.pages[query.data.pages.length - 1]?.nextCursor;

  return {
    events,
    hasMore,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

export function useInvalidateActivity() {
  const queryClient = useQueryClient();
  return (scope?: { connectionId: string; bucket: string }) => {
    if (scope) {
      return queryClient.invalidateQueries({
        queryKey: [...queryKeys.activity.all, scope.connectionId, scope.bucket],
      });
    }
    return queryClient.invalidateQueries({ queryKey: queryKeys.activity.all });
  };
}
