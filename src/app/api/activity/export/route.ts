import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getConnectionAccessById } from "@/lib/db/connections";
import prisma from "@/lib/db/prisma";
import { buildWhereClause, getActivityRetentionCutoff } from "../query-helpers";
import { getTierLimits } from "@/lib/subscriptions";
import { toActivityCsv } from "@/lib/activity/csv";
import type { ActivityCsvRow } from "@/lib/activity/csv";

const MAX_EXPORT_ROWS = 50_000;
const PAGE = 1_000;

export const GET = withAuth(async (req: NextRequest, { user }) => {
  const { searchParams } = req.nextUrl;
  const connectionId = searchParams.get("connectionId");
  const bucket = searchParams.get("bucket");
  if (!connectionId || !bucket) {
    return NextResponse.json({ error: "connectionId and bucket are required" }, { status: 400 });
  }
  const access = await getConnectionAccessById(connectionId, user.id);
  if (!access) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  const prefix = searchParams.get("prefix") || null;
  const key = searchParams.get("key") || null;
  const userId = searchParams.get("userId") || null;
  const actionsParam = searchParams.get("actions");
  const actions = actionsParam ? actionsParam.split(",").filter(Boolean) : null;

  const tier = user.subscription?.tier ?? "FREE";
  const retentionCutoff = getActivityRetentionCutoff(getTierLimits(tier).activityRetentionDays);
  const where = buildWhereClause({ connectionId, bucket, prefix, key, userId, actions, sinceDate: retentionCutoff });

  const rows: ActivityCsvRow[] = [];
  let cursor: { createdAt: Date; id: string } | undefined;
  let truncated = false;
  for (;;) {
    const pageWhere = cursor
      ? { ...where, OR: [ { createdAt: { equals: cursor.createdAt }, id: { lt: cursor.id } }, { createdAt: { lt: cursor.createdAt } } ] }
      : where;
    const page = await prisma.activityEvent.findMany({
      where: pageWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: PAGE,
    });
    for (const e of page) {
      rows.push({
        createdAt: e.createdAt.toISOString(), action: String(e.action),
        userDisplayName: e.userDisplayName, userId: e.userId,
        bucket: e.bucket, key: e.key, targetKey: e.targetKey,
        byteSize: e.byteSize !== null ? e.byteSize.toString() : null, batchId: e.batchId,
      });
      if (rows.length >= MAX_EXPORT_ROWS) { truncated = true; break; }
    }
    if (truncated || page.length < PAGE) break;
    const last = page[page.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
  }

  const csv = toActivityCsv(rows);
  const filename = `activity-${bucket}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Export-Truncated": truncated ? "true" : "false",
    },
  });
});
