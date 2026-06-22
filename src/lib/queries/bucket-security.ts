"use client";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import type { BucketSecurityPosture } from "@/lib/s3/security-posture";

async function fetchBucketSecurity(
  connectionId: string,
  bucket: string,
): Promise<BucketSecurityPosture | null> {
  const res = await fetch(
    `/api/connections/${connectionId}/buckets/${encodeURIComponent(bucket)}/security-posture`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch security posture");
  }
  return res.json();
}

export function useBucketSecurityPosture(
  connectionId: string,
  bucket: string,
): UseQueryResult<BucketSecurityPosture | null> {
  return useQuery({
    queryKey: queryKeys.bucketSecurity.byBucket(connectionId, bucket),
    queryFn: () => fetchBucketSecurity(connectionId, bucket),
    enabled: !!connectionId && !!bucket,
    staleTime: 60_000,
  });
}
