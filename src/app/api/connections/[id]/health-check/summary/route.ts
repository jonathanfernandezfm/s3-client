// src/app/api/connections/[id]/health-check/summary/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getConnectionAccessById } from "@/lib/db/connections";
import prisma from "@/lib/db/prisma";
import { buildCapabilities } from "@/lib/health/rollup";
import {
  STALENESS_THRESHOLD_MS,
  type CapabilityKey,
  type CapabilityStatus,
  type HealthSummary,
  type ProbeResult,
  type ProbeResultRecord,
} from "@/lib/health/probe";
import { BUCKET_PROBES, CONNECTION_PROBES } from "@/lib/health/registry";

type RouteContext = { params: Promise<{ id: string }> };

function reduceToStatusMap(
  records: ProbeResultRecord[],
  scope: "connection" | "bucket",
): Partial<Record<CapabilityKey, CapabilityStatus>> {
  const result: Partial<Record<CapabilityKey, CapabilityStatus>> = {};
  for (const cap of buildCapabilities(scope, records)) {
    result[cap.key] = cap.status;
  }
  return result;
}

export const GET = withAuth<RouteContext>(
  async (_req, { user, params }) => {
    const { id } = params;
    const access = await getConnectionAccessById(id, user.id);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [connRow, bucketRows] = await Promise.all([
      prisma.connectionHealthCheck.findUnique({
        where: { connectionId: id },
        include: { probes: true },
      }),
      prisma.bucketHealthCheck.findMany({
        where: { connectionId: id },
        include: { probes: true },
      }),
    ]);

    let connection: HealthSummary["connection"] = null;
    let isConnectionStale = false;
    if (connRow) {
      const records: ProbeResultRecord[] = connRow.probes.map((p) => {
        const probe = CONNECTION_PROBES.find((cp) => cp.key === p.probeKey);
        return {
          key: p.probeKey,
          capability: probe?.capability ?? "browse-buckets",
          required: probe?.required ?? true,
          result: p.result as ProbeResult,
          errorCode: p.errorCode ?? undefined,
          durationMs: p.durationMs,
        };
      });
      connection = reduceToStatusMap(records, "connection");
      isConnectionStale =
        Date.now() - connRow.checkedAt.getTime() > STALENESS_THRESHOLD_MS;
    }

    const buckets: HealthSummary["buckets"] = {};
    const staleBuckets: string[] = [];
    for (const row of bucketRows) {
      const records: ProbeResultRecord[] = row.probes.map((p) => {
        const probe = BUCKET_PROBES.find((bp) => bp.key === p.probeKey);
        return {
          key: p.probeKey,
          capability: probe?.capability ?? "browse-objects",
          required: probe?.required ?? true,
          result: p.result as ProbeResult,
          errorCode: p.errorCode ?? undefined,
          durationMs: p.durationMs,
        };
      });
      buckets[row.bucket] = reduceToStatusMap(records, "bucket");
      if (Date.now() - row.checkedAt.getTime() > STALENESS_THRESHOLD_MS) {
        staleBuckets.push(row.bucket);
      }
    }

    const summary: HealthSummary = {
      connectionId: id,
      connection,
      buckets,
      staleBuckets,
      isConnectionStale,
    };
    return NextResponse.json(summary);
  },
);
