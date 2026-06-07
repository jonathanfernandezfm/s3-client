"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUpgradeModalStore } from "@/lib/stores/upgrade-modal-store";
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

type TriggerError = { status?: number; body?: { error?: string; jobId?: string } };

export function useTriggerSearchIndex() {
  const qc = useQueryClient();
  const openUpgrade = useUpgradeModalStore((s) => s.open);

  return useMutation<
    { ok: true; jobId: string; state: "indexing" },
    TriggerError,
    string,
    { previous?: SearchIndexStatus }
  >({
    mutationFn: async (connectionId) => {
      const res = await fetch(
        `/api/connections/${connectionId}/search-index/trigger`,
        { method: "POST" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw { status: res.status, body } satisfies TriggerError;
      return body as { ok: true; jobId: string; state: "indexing" };
    },
    onMutate: async (connectionId) => {
      await qc.cancelQueries({
        queryKey: queryKeys.searchIndex.status(connectionId),
      });
      const previous = qc.getQueryData<SearchIndexStatus>(
        queryKeys.searchIndex.status(connectionId),
      );
      qc.setQueryData<SearchIndexStatus>(
        queryKeys.searchIndex.status(connectionId),
        { state: "indexing", indexed: 0 },
      );
      return { previous };
    },
    onSuccess: (_data, connectionId) => {
      qc.invalidateQueries({
        queryKey: queryKeys.searchIndex.status(connectionId),
      });
    },
    onError: (err, connectionId, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(
          queryKeys.searchIndex.status(connectionId),
          context.previous,
        );
      }
      qc.invalidateQueries({
        queryKey: queryKeys.searchIndex.status(connectionId),
      });
      if (err?.status === 402) openUpgrade();
    },
  });
}
