// src/lib/health/runner.ts
import prisma from "@/lib/db/prisma";
import { createS3Client } from "@/lib/s3/client";
import { decrypt } from "@/lib/crypto";
import { buildCapabilities } from "./rollup";
import { deriveConnectivity } from "./connectivity";
import { withMutex } from "./mutex";
import { probesForScope } from "./registry";
import {
  PROBE_TIMEOUT_MS,
  RUN_TIMEOUT_MS,
  STALENESS_THRESHOLD_MS,
  type Connectivity,
  type HealthReport,
  type Probe,
  type ProbeResult,
  type ProbeResultRecord,
  type ProbeScope,
} from "./probe";

interface ConnectionRecord {
  id: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  updatedAt: Date;
}

async function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => {
      const err = Object.assign(new Error("Probe timed out"), {
        name: "TimeoutError",
      });
      reject(err);
    }, ms);
  });
}

async function runProbeWithTimeout(
  probe: Probe,
  ctx: { client: ReturnType<typeof createS3Client>; bucket?: string; randomKey: string },
): Promise<ProbeResultRecord> {
  const start = performance.now();
  try {
    const outcome = await Promise.race([
      probe.run(ctx),
      timeoutAfter(PROBE_TIMEOUT_MS).then(() => {
        throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
      }),
    ]);
    return {
      key: probe.key,
      capability: probe.capability,
      required: probe.required,
      result: outcome.result,
      errorCode: outcome.errorCode,
      durationMs: outcome.durationMs,
    };
  } catch (err) {
    const e = err as { name?: string };
    const isTimeout = e?.name === "TimeoutError";
    return {
      key: probe.key,
      capability: probe.capability,
      required: probe.required,
      result: "error" as ProbeResult,
      errorCode: isTimeout ? "timeout" : "exception",
      durationMs: Math.max(0, performance.now() - start),
    };
  }
}

function decryptConnection(c: ConnectionRecord): ConnectionRecord {
  return { ...c, secretAccessKey: decrypt(c.secretAccessKey) };
}

function buildRandomKey(): string {
  return `__s3client-healthcheck__/probe-${crypto.randomUUID()}`;
}

function logResult(
  scope: ProbeScope,
  connectionId: string,
  bucket: string | undefined,
  durationMs: number,
  connectivity: Connectivity,
  records: ProbeResultRecord[],
): void {
  const counts = { granted: 0, denied: 0, unsupported: 0, errors: 0, skipped: 0 };
  for (const r of records) {
    if (r.result === "granted") counts.granted++;
    else if (r.result === "denied") counts.denied++;
    else if (r.result === "unsupported") counts.unsupported++;
    else if (r.result === "error") counts.errors++;
    else if (r.result === "skipped") counts.skipped++;
  }
  console.log(
    `[health] connectionId=${connectionId} scope=${scope}${
      bucket ? ` bucket=${bucket}` : ""
    } durationMs=${Math.round(durationMs)} connectivity=${connectivity} granted=${counts.granted} denied=${counts.denied} unsupported=${counts.unsupported} errors=${counts.errors} skipped=${counts.skipped}`,
  );
}

function buildReport(
  scope: ProbeScope,
  connectionId: string,
  bucket: string | undefined,
  checkedAt: Date,
  durationMs: number,
  records: ProbeResultRecord[],
): HealthReport {
  const connectivity = deriveConnectivity(scope, records);
  const capabilities = buildCapabilities(scope, records);
  const isStale =
    Date.now() - checkedAt.getTime() > STALENESS_THRESHOLD_MS;
  return {
    scope,
    connectionId,
    bucket,
    checkedAt: checkedAt.toISOString(),
    isStale,
    durationMs: Math.round(durationMs),
    connectivity,
    capabilities,
  };
}

export async function runConnectionHealthCheck(
  connectionId: string,
): Promise<HealthReport> {
  return withMutex(`connection:${connectionId}`, () =>
    runScope("connection", connectionId, undefined),
  );
}

export async function runBucketHealthCheck(
  connectionId: string,
  bucket: string,
): Promise<HealthReport> {
  return withMutex(`bucket:${connectionId}:${bucket}`, () =>
    runScope("bucket", connectionId, bucket),
  );
}

async function runScope(
  scope: ProbeScope,
  connectionId: string,
  bucket: string | undefined,
): Promise<HealthReport> {
  const overallStart = performance.now();

  const record = (await prisma.connection.findUnique({
    where: { id: connectionId },
  })) as ConnectionRecord | null;
  if (!record) {
    throw new Error(`Connection not found: ${connectionId}`);
  }
  const initialUpdatedAt = record.updatedAt.getTime();
  const decrypted = decryptConnection(record);

  const client = createS3Client({
    endpoint: decrypted.endpoint,
    accessKeyId: decrypted.accessKeyId,
    secretAccessKey: decrypted.secretAccessKey,
    region: decrypted.region,
    forcePathStyle: decrypted.forcePathStyle,
  });

  const randomKey = buildRandomKey();
  const probes = probesForScope(scope);
  const ctx = { client, bucket, randomKey };

  const runAll = Promise.allSettled(
    probes.map((p) => runProbeWithTimeout(p, ctx)),
  ).then((settled) =>
    settled.map((s, i) =>
      s.status === "fulfilled"
        ? s.value
        : {
            key: probes[i].key,
            capability: probes[i].capability,
            required: probes[i].required,
            result: "error" as ProbeResult,
            errorCode: "exception",
            durationMs: 0,
          },
    ),
  );

  const records = await Promise.race([
    runAll,
    timeoutAfter(RUN_TIMEOUT_MS),
  ]).catch(() =>
    probes.map((p) => ({
      key: p.key,
      capability: p.capability,
      required: p.required,
      result: "error" as ProbeResult,
      errorCode: "timeout",
      durationMs: RUN_TIMEOUT_MS,
    })),
  );

  const checkedAt = new Date();
  const durationMs = performance.now() - overallStart;
  const report = buildReport(
    scope,
    connectionId,
    bucket,
    checkedAt,
    durationMs,
    records,
  );

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.connection.findUnique({
      where: { id: connectionId },
    });
    if (!fresh) return;
    if (fresh.updatedAt.getTime() !== initialUpdatedAt) return;

    if (scope === "connection") {
      const upserted = await tx.connectionHealthCheck.upsert({
        where: { connectionId },
        create: {
          connectionId,
          checkedAt,
          durationMs: Math.round(durationMs),
          connectivity: report.connectivity,
        },
        update: {
          checkedAt,
          durationMs: Math.round(durationMs),
          connectivity: report.connectivity,
        },
      });
      await tx.connectionPermissionCheck.deleteMany({
        where: { healthCheckId: upserted.id },
      });
      await tx.connectionPermissionCheck.createMany({
        data: records.map((r) => ({
          healthCheckId: upserted.id,
          probeKey: r.key,
          result: r.result,
          errorCode: r.errorCode ?? null,
          durationMs: Math.round(r.durationMs),
        })),
      });
    } else {
      const upserted = await tx.bucketHealthCheck.upsert({
        where: { connectionId_bucket: { connectionId, bucket: bucket! } },
        create: {
          connectionId,
          bucket: bucket!,
          checkedAt,
          durationMs: Math.round(durationMs),
          connectivity: report.connectivity,
        },
        update: {
          checkedAt,
          durationMs: Math.round(durationMs),
          connectivity: report.connectivity,
        },
      });
      await tx.bucketPermissionCheck.deleteMany({
        where: { healthCheckId: upserted.id },
      });
      await tx.bucketPermissionCheck.createMany({
        data: records.map((r) => ({
          healthCheckId: upserted.id,
          probeKey: r.key,
          result: r.result,
          errorCode: r.errorCode ?? null,
          durationMs: Math.round(r.durationMs),
        })),
      });
    }
  });

  logResult(scope, connectionId, bucket, durationMs, report.connectivity, records);
  return report;
}
