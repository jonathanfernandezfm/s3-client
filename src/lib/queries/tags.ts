"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import type { TagPair } from "@/lib/tags";

type ObjectTagsResponse = { tags: TagPair[] };
type BatchTagsResponse = { tags: Record<string, string[]> };

async function fetchObjectTags(
  connectionId: string,
  bucket: string,
  key: string
): Promise<TagPair[]> {
  const params = new URLSearchParams({ connectionId, bucket, key });
  const r = await fetch(`/api/objects/tag?${params.toString()}`);
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: "Failed" }));
    throw new Error(e.error || "Failed to fetch tags");
  }
  const data = (await r.json()) as ObjectTagsResponse;
  return data.tags;
}

async function fetchBatchTags(
  connectionId: string,
  bucket: string,
  keys: string[]
): Promise<Record<string, string[]>> {
  const r = await fetch(`/api/objects/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, bucket, keys }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: "Failed" }));
    throw new Error(e.error || "Failed to fetch tags");
  }
  const data = (await r.json()) as BatchTagsResponse;
  return data.tags;
}

/** Authoritative key/value tags for one object, straight from S3. Used by the editor dialog. */
export function useObjectTags(args: {
  connectionId: string;
  bucket: string;
  key: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.tags.object(args.connectionId, args.bucket, args.key),
    queryFn: () => fetchObjectTags(args.connectionId, args.bucket, args.key),
    enabled:
      (args.enabled ?? true) && !!args.connectionId && !!args.bucket && !!args.key,
    staleTime: 0,
  });
}

/** Tag values for the visible file keys, from the object index. Used for chips and filtering. */
export function useFileTags(args: {
  connectionId: string;
  bucket: string;
  keys: string[];
}) {
  const sorted = [...args.keys].sort();
  return useQuery({
    queryKey: queryKeys.tags.batch(args.connectionId, args.bucket, sorted),
    queryFn: () => fetchBatchTags(args.connectionId, args.bucket, sorted),
    enabled: !!args.connectionId && !!args.bucket && sorted.length > 0,
    staleTime: 60_000,
  });
}

export function useInvalidateTags() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.tags.all });
}
