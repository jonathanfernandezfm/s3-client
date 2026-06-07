import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { getConnectionAccessById } from "@/lib/db/connections";
import { isSearchIndexEnabled } from "@/lib/search/feature-flag";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withAuth<RouteContext>(async (req, { user, params }) => {
  const { id } = params;

  if (!isSearchIndexEnabled()) {
    return NextResponse.json(
      { error: "Search indexing not available" },
      { status: 503 },
    );
  }

  const access = await getConnectionAccessById(id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tier = user.subscription?.tier ?? "FREE";
  if (tier !== "PRO" && tier !== "ENTERPRISE") {
    return NextResponse.json(
      { error: "PRO subscription required" },
      { status: 402 },
    );
  }

  const existing = await prisma.crawlJob.findFirst({
    where: { connectionId: id, status: { in: ["PENDING", "RUNNING"] } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Index already started", jobId: existing.id },
      { status: 409 },
    );
  }

  const job = await prisma.crawlJob.create({
    data: {
      connectionId: id,
      kind: "INITIAL",
      status: "PENDING",
      bucketsRemaining: [],
    },
  });

  const token = process.env.INTERNAL_API_TOKEN;
  if (token) {
    fetch(`${req.nextUrl.origin}/api/internal/crawl?jobId=${job.id}`, {
      method: "POST",
      headers: { "x-internal-token": token },
    }).catch((err) => {
      console.error(
        `[search-index] manual trigger fire failed for ${id}:`,
        err,
      );
    });
  }

  return NextResponse.json(
    { ok: true, jobId: job.id, state: "indexing" },
    { status: 202 },
  );
});
