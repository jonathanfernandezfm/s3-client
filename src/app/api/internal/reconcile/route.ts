import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { isSearchIndexEnabled } from "@/lib/search/feature-flag";

const RECONCILE_INTERVAL_MIN = 60;
const STUCK_AFTER_MIN = 10;

function checkInternalAuth(req: NextRequest): boolean {
  const token = process.env.INTERNAL_API_TOKEN;
  if (!token) return false;
  return req.headers.get("x-internal-token") === token;
}

async function fireCrawl(jobId: string, baseUrl: string): Promise<void> {
  const token = process.env.INTERNAL_API_TOKEN;
  if (!token) return;
  fetch(`${baseUrl}/api/internal/crawl?jobId=${jobId}`, {
    method: "POST",
    headers: { "x-internal-token": token },
  }).catch((err) => {
    console.error("[search-index] reconcile fire failed", { jobId, err });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSearchIndexEnabled()) {
    return NextResponse.json({ error: "Disabled" }, { status: 404 });
  }
  if (!checkInternalAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const reconcileThreshold = new Date(now.getTime() - RECONCILE_INTERVAL_MIN * 60_000);
  const stuckThreshold = new Date(now.getTime() - STUCK_AFTER_MIN * 60_000);

  // Stuck-job rescue: reset RUNNING jobs whose lastTickAt is too old.
  const stuck = await prisma.crawlJob.findMany({
    where: { status: "RUNNING", lastTickAt: { lt: stuckThreshold } },
    select: { id: true },
  });
  for (const j of stuck) {
    await prisma.crawlJob.update({
      where: { id: j.id },
      data: { status: "PENDING" },
    });
    await fireCrawl(j.id, req.nextUrl.origin);
  }

  // Find connections needing a new RECONCILE.
  const connections = await prisma.connection.findMany({ select: { id: true } });
  const fired: string[] = [];
  for (const conn of connections) {
    const recent = await prisma.crawlJob.findFirst({
      where: {
        connectionId: conn.id,
        kind: "RECONCILE",
        OR: [
          { status: "RUNNING" },
          { status: { in: ["COMPLETED", "PARTIAL_LIMIT_HIT", "FAILED"] }, completedAt: { gte: reconcileThreshold } },
        ],
      },
    });
    if (recent) continue;
    const job = await prisma.crawlJob.create({
      data: {
        connectionId: conn.id,
        kind: "RECONCILE",
        status: "PENDING",
        bucketsRemaining: [],
      },
    });
    await fireCrawl(job.id, req.nextUrl.origin);
    fired.push(job.id);
  }

  return NextResponse.json({
    ok: true,
    stuckRescued: stuck.length,
    reconcileQueued: fired.length,
  });
}

// Also allow GET for cron services that prefer it.
export const GET = POST;
