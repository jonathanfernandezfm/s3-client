// src/lib/queries/health.ts
"use client";

import { useMemo } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { CAPABILITIES } from "@/lib/health/capabilities";
import type {
  CapabilityKey,
  CapabilityStatus,
  HealthReport,
  HealthSummary,
} from "@/lib/health/probe";

async function fetchConnectionHealth(
  connectionId: string,
): Promise<HealthReport | null> {
  const res = await fetch(
    `/api/connections/${connectionId}/health-check`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch health");
  }
  return res.json();
}

async function fetchBucketHealth(
  connectionId: string,
  bucket: string,
): Promise<HealthReport | null> {
  const res = await fetch(
    `/api/connections/${connectionId}/buckets/${encodeURIComponent(bucket)}/health-check`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch bucket health");
  }
  return res.json();
}

async function fetchHealthSummary(
  connectionId: string,
): Promise<HealthSummary> {
  const res = await fetch(
    `/api/connections/${connectionId}/health-check/summary`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch summary");
  }
  return res.json();
}

async function runConnectionHealth(
  connectionId: string,
): Promise<HealthReport> {
  const res = await fetch(
    `/api/connections/${connectionId}/health-check`,
    { method: "POST" },
  );
  // 502 still returns a body — read it before deciding error
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 502) {
    throw new Error(body.error || `Health check failed (${res.status})`);
  }
  return body as HealthReport;
}

async function runBucketHealth(
  connectionId: string,
  bucket: string,
): Promise<HealthReport> {
  const res = await fetch(
    `/api/connections/${connectionId}/buckets/${encodeURIComponent(bucket)}/health-check`,
    { method: "POST" },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 502) {
    throw new Error(body.error || `Health check failed (${res.status})`);
  }
  return body as HealthReport;
}

export function useConnectionHealth(
  connectionId: string,
): UseQueryResult<HealthReport | null> {
  return useQuery({
    queryKey: queryKeys.health.connection(connectionId),
    queryFn: () => fetchConnectionHealth(connectionId),
    enabled: !!connectionId,
    staleTime: 60_000,
  });
}

export function useBucketHealth(
  connectionId: string,
  bucket: string,
): UseQueryResult<HealthReport | null> {
  return useQuery({
    queryKey: queryKeys.health.bucket(connectionId, bucket),
    queryFn: () => fetchBucketHealth(connectionId, bucket),
    enabled: !!connectionId && !!bucket,
    staleTime: 60_000,
  });
}

export function useHealthSummary(
  connectionId: string,
): UseQueryResult<HealthSummary> {
  return useQuery({
    queryKey: queryKeys.health.summary(connectionId),
    queryFn: () => fetchHealthSummary(connectionId),
    enabled: !!connectionId,
    staleTime: 60_000,
  });
}

export function useRunConnectionHealth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { connectionId: string }) =>
      runConnectionHealth(vars.connectionId),
    onSuccess: (data, vars) => {
      qc.setQueryData(queryKeys.health.connection(vars.connectionId), data);
      qc.invalidateQueries({
        queryKey: queryKeys.health.summary(vars.connectionId),
      });
    },
  });
}

export function useRunBucketHealth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { connectionId: string; bucket: string }) =>
      runBucketHealth(vars.connectionId, vars.bucket),
    onSuccess: (data, vars) => {
      qc.setQueryData(
        queryKeys.health.bucket(vars.connectionId, vars.bucket),
        data,
      );
      qc.invalidateQueries({
        queryKey: queryKeys.health.summary(vars.connectionId),
      });
    },
  });
}

export function useApplyCorsFix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { connectionId: string; bucket: string }) => {
      const res = await fetch(
        `/api/connections/${vars.connectionId}/buckets/${encodeURIComponent(vars.bucket)}/apply-cors`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to apply CORS (${res.status})`);
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: queryKeys.health.bucket(vars.connectionId, vars.bucket),
      });
    },
  });
}

export interface CapabilityResolution {
  status: CapabilityStatus;
  reason: string | null;
  isLoading: boolean;
}

export function useCapability(
  connectionId: string,
  bucket: string | undefined,
  capability: CapabilityKey,
): CapabilityResolution {
  const { data: summary, isLoading } = useHealthSummary(connectionId);

  return useMemo(() => {
    if (isLoading || !summary) {
      return { status: "available", reason: null, isLoading: true };
    }
    const status: CapabilityStatus | undefined = bucket
      ? summary.buckets[bucket]?.[capability]
      : summary.connection?.[capability];

    if (!status) {
      return { status: "available", reason: null, isLoading: false };
    }

    if (status === "available" || status === "untested") {
      return { status, reason: null, isLoading: false };
    }

    const actions = CAPABILITIES[capability].requiredIamActions.join(", ");
    let reason: string;
    if (status === "unavailable") {
      reason = `You don't have ${actions}${bucket ? ` on this bucket` : ""}. See Permissions for details.`;
    } else if (status === "unsupported") {
      reason = `Not supported by this provider.`;
    } else {
      reason = `Couldn't verify ${actions}. Refresh the permission check.`;
    }
    return { status, reason, isLoading: false };
  }, [summary, isLoading, bucket, capability]);
}

export function useInvalidateConnectionHealth() {
  const qc = useQueryClient();
  return (connectionId: string) => {
    qc.invalidateQueries({
      queryKey: queryKeys.health.connection(connectionId),
    });
    qc.invalidateQueries({
      queryKey: queryKeys.health.summary(connectionId),
    });
  };
}
