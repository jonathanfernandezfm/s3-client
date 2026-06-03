import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getConnectionAccessById } from "@/lib/db/connections";
import prisma from "@/lib/db/prisma";
import {
  encodeCursor,
  decodeCursor,
  buildWhereClause,
  parseLimit,
} from "./query-helpers";

export const GET = withAuth(async (req: NextRequest, { user }) => {
  const { searchParams } = req.nextUrl;

  const connectionId = searchParams.get("connectionId");
  const bucket = searchParams.get("bucket");

  if (!connectionId || !bucket) {
    return NextResponse.json(
      { error: "connectionId and bucket are required" },
      { status: 400 }
    );
  }

  const access = await getConnectionAccessById(connectionId, user.id);
  if (!access) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const prefix = searchParams.get("prefix") || null;
  const key = searchParams.get("key") || null;
  const userId = searchParams.get("userId") || null;
  const actionsParam = searchParams.get("actions");
  const actions = actionsParam ? actionsParam.split(",").filter(Boolean) : null;
  const cursorParam = searchParams.get("cursor") || null;
  const limit = parseLimit(searchParams.get("limit"));

  const cursor = cursorParam ? decodeCursor(cursorParam) : null;

  const where = buildWhereClause({ connectionId, bucket, prefix, key, userId, actions, cursor });

  const rows = await prisma.activityEvent.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;

  const nextCursor =
    hasMore && events.length > 0
      ? encodeCursor(events[events.length - 1].createdAt, events[events.length - 1].id)
      : null;

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      userId: e.userId,
      userDisplayName: e.userDisplayName,
      userImageUrl: e.userImageUrl,
      action: e.action,
      bucket: e.bucket,
      key: e.key,
      targetKey: e.targetKey,
      byteSize: e.byteSize !== null ? e.byteSize.toString() : null,
      batchId: e.batchId,
      createdAt: e.createdAt.toISOString(),
    })),
    nextCursor,
  });
});
