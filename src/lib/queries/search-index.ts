"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./keys";

export type SearchIndexStatus =
  | { state: "indexing"; indexed: number }
  | { state: "ready"; indexed: number; lastReconciledAt: string | null }
  | { state: "partial"; indexed: number }
  | { state: "failed"; message: string }
  | { state: "disabled" }
  | { state: "none" };

export function useSearchIndexStatus(connectionId: string) {
  return useQuery<SearchIndexStatus>({
    queryKey: queryKeys.searchIndex.status(connectionId),
    queryFn: async () => {
      const res = await fetch(
        `/api/connections/${connectionId}/search-index-status`,
      );
      if (!res.ok) return { state: "disabled" } as SearchIndexStatus;
      return res.json();
    },
    refetchInterval: (q) =>
      q.state.data?.state === "indexing" ? 5_000 : false,
    staleTime: 10_000,
  });
}
