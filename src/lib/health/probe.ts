// src/lib/health/probe.ts
import type { S3Client } from "@aws-sdk/client-s3";

export type CapabilityKey =
  | "browse-buckets"
  | "create-buckets"
  | "delete-buckets"
  | "browse-objects"
  | "download-objects"
  | "upload-objects"
  | "delete-objects"
  | "copy-objects"
  | "object-tagging"
  | "list-versions"
  | "manage-versioning"
  | "view-multipart"
  | "cors-direct-uploads";

export type ProbeScope = "connection" | "bucket";

export type ProbeResult =
  | "granted"
  | "denied"
  | "unsupported"
  | "error"
  | "skipped";

export type CapabilityStatus =
  | "available"
  | "unavailable"
  | "unsupported"
  | "unknown"
  | "untested";

export type Connectivity = "ok" | "unreachable" | "missing-bucket";

export interface ProbeContext {
  client: S3Client;
  bucket?: string;
  randomKey: string;
}

export interface ProbeRunOutcome {
  result: ProbeResult;
  errorCode?: string;
  durationMs: number;
}

export interface Probe {
  key: string;
  capability: CapabilityKey;
  scope: ProbeScope;
  required: boolean;
  run: (ctx: ProbeContext) => Promise<ProbeRunOutcome>;
}

export interface ProbeResultRecord {
  key: string;
  capability: CapabilityKey;
  required: boolean;
  result: ProbeResult;
  errorCode?: string;
  durationMs: number;
}

export interface CapabilityReport {
  key: CapabilityKey;
  label: string;
  status: CapabilityStatus;
  probes: Array<{
    key: string;
    result: ProbeResult;
    errorCode?: string;
  }>;
  requiredIamActions: string[];
  affects: string[];
  fixAction?: string;
}

export interface HealthReport {
  scope: ProbeScope;
  connectionId: string;
  bucket?: string;
  checkedAt: string;
  isStale: boolean;
  durationMs: number;
  connectivity: Connectivity;
  capabilities: CapabilityReport[];
}

export interface HealthSummary {
  connectionId: string;
  connection: Partial<Record<CapabilityKey, CapabilityStatus>> | null;
  buckets: Record<string, Partial<Record<CapabilityKey, CapabilityStatus>>>;
  staleBuckets: string[];
  isConnectionStale: boolean;
}

export const STALENESS_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
export const PROBE_TIMEOUT_MS = 5_000;
export const RUN_TIMEOUT_MS = 30_000;
