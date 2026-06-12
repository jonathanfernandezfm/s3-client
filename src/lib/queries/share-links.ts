"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { track } from "@/lib/analytics";

export type ShareLinkResponse = {
  id: string;
  slug: string;
  bucket: string;
  key: string;
  createdById: string | null;
  createdByDisplayName: string;
  createdByImageUrl: string | null;
  expiresAt: string | null;
  hasPassword: boolean;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
  description: string | null;
  createdAt: string;
  status: "active" | "expired" | "exhausted" | "revoked";
};

export function useShareLinks(
  connectionId: string,
  filter?: { bucket?: string; key?: string }
) {
  return useQuery({
    queryKey: queryKeys.shareLinks.list(connectionId, filter?.bucket, filter?.key),
    enabled: !!connectionId,
    queryFn: async () => {
      const sp = new URLSearchParams({ connectionId });
      if (filter?.bucket) sp.set("bucket", filter.bucket);
      if (filter?.key) sp.set("key", filter.key);
      const r = await fetch(`/api/share-links?${sp.toString()}`);
      if (!r.ok) throw new Error("Failed to load share links");
      const data = (await r.json()) as { shareLinks: ShareLinkResponse[] };
      return data.shareLinks;
    },
  });
}

export type CreateInput = {
  connectionId: string;
  bucket: string;
  key: string;
  expiresIn?: number | null;
  password?: string | null;
  maxUses?: number | null;
  description?: string | null;
  batchId?: string;
};

export function useCreateShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInput) => {
      const r = await fetch("/api/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!r.ok) throw new Error("Failed to create share link");
      return (await r.json()) as { shareLink: ShareLinkResponse; url: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.shareLinks.all });
      track({ name: "share_link_created" });
    },
  });
}

export function useShareLinkCounts(args: {
  connectionId: string;
  bucket: string;
  keys: string[];
}) {
  const sorted = [...args.keys].sort();
  return useQuery({
    queryKey: queryKeys.shareLinks.counts(args.connectionId, args.bucket, sorted),
    queryFn: async () => {
      const r = await fetch("/api/share-links/counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: args.connectionId, bucket: args.bucket, keys: sorted }),
      });
      if (!r.ok) throw new Error("Failed to fetch share link counts");
      const data = (await r.json()) as { counts: Record<string, number> };
      return data.counts;
    },
    enabled: !!args.connectionId && !!args.bucket && sorted.length > 0,
    staleTime: 60_000,
  });
}

export function useRevokeShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/share-links/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to revoke share link");
      return (await r.json()) as { revokedAt: string | null };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.shareLinks.all });
    },
  });
}
