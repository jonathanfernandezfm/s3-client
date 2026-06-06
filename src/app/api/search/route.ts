import { NextResponse } from "next/server";
import { LRUCache } from "lru-cache";
import { withAuth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { parseSearchQuery } from "@/lib/search/query";
import { getUserWorkspaceIds } from "@/lib/search/workspace-ids";
import { isSearchIndexEnabled } from "@/lib/search/feature-flag";

const rateLimit = new LRUCache<string, number[]>({ max: 5000, ttl: 60_000 });

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const window = 10_000;
  const max = 30;
  const arr = (rateLimit.get(userId) ?? []).filter((t) => now - t < window);
  if (arr.length >= max) return true;
  arr.push(now);
  rateLimit.set(userId, arr);
  return false;
}

type SearchRow = {
  id: string;
  workspace_id: string;
  connection_id: string;
  bucket: string;
  key: string;
  size: bigint;
  last_modified: Date;
  mime: string | null;
  extension: string | null;
  tags: unknown;
  connection_name: string | null;
  connection_endpoint: string;
  score: number;
};

function dirOf(key: string): string {
  const i = key.lastIndexOf("/");
  return i < 0 ? "" : key.slice(0, i + 1);
}

export const GET = withAuth(async (req, { user }) => {
  if (!isSearchIndexEnabled()) {
    return NextResponse.json({ error: "Search disabled" }, { status: 404 });
  }
  const tier = user.subscription?.tier ?? "FREE";
  if (tier === "FREE") {
    return NextResponse.json({ error: "PRO subscription required" }, { status: 403 });
  }
  if (rateLimited(user.id)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20));
  const parsed = parseSearchQuery(q);

  const workspaceIds = await getUserWorkspaceIds(user.id);
  if (workspaceIds.length === 0) {
    return NextResponse.json({ results: [], parsedQuery: parsed, partial: false });
  }

  // Build the prepared statement values.
  const mimePattern = parsed.mime
    ? parsed.mime.includes("/")
      ? parsed.mime
      : `${parsed.mime}/%`
    : null;
  const connectionPattern = parsed.connection ? `%${parsed.connection}%` : null;
  const queryText = parsed.freeText.toLowerCase().trim();

  // Extract typed nullables to avoid TypeScript inference issues with bigint | undefined.
  const sizeMin: bigint | null = parsed.sizeMin ?? null;
  const sizeMax: bigint | null = parsed.sizeMax ?? null;
  const before: Date | null = parsed.before ?? null;
  const after: Date | null = parsed.after ?? null;
  const ext: string | null = parsed.ext ?? null;
  const bucket: string | null = parsed.bucket ?? null;
  const tag: string | null = parsed.tag ?? null;

  // Use Prisma.$queryRaw with parameterized tagged template.
  const rows = await prisma.$queryRaw<SearchRow[]>`
    SELECT
      oi.id::text                AS id,
      oi.workspace_id::text      AS workspace_id,
      oi.connection_id::text     AS connection_id,
      oi.bucket                  AS bucket,
      oi.key                     AS key,
      oi.size                    AS size,
      oi.last_modified           AS last_modified,
      oi.mime                    AS mime,
      oi.extension               AS extension,
      oi.tags                    AS tags,
      c.name                     AS connection_name,
      c.endpoint                 AS connection_endpoint,
      CASE WHEN ${queryText}::text = '' THEN 0
           ELSE similarity(oi.search_text, ${queryText}::text) END AS score
    FROM object_index oi
    JOIN connections c ON c.id = oi.connection_id
    WHERE oi.workspace_id = ANY(${workspaceIds}::text[])
      AND (${queryText}::text = '' OR oi.search_text % ${queryText}::text)
      AND (${mimePattern}::text IS NULL OR oi.mime LIKE ${mimePattern}::text)
      AND (${ext}::text IS NULL OR oi.extension = ${ext}::text)
      AND (${sizeMin}::bigint IS NULL OR oi.size >= ${sizeMin}::bigint)
      AND (${sizeMax}::bigint IS NULL OR oi.size <= ${sizeMax}::bigint)
      AND (${before}::timestamptz IS NULL OR oi.last_modified < ${before}::timestamptz)
      AND (${after}::timestamptz IS NULL OR oi.last_modified >= ${after}::timestamptz)
      AND (${bucket}::text IS NULL OR oi.bucket = ${bucket}::text)
      AND (${connectionPattern}::text IS NULL OR c.name ILIKE ${connectionPattern}::text)
      AND (${tag}::text IS NULL OR oi.tags ? ${tag}::text)
    ORDER BY score DESC, oi.last_modified DESC
    LIMIT ${limit}
  `;

  // Partial-index detection across in-scope connections.
  const partialCount = await prisma.crawlJob.count({
    where: {
      status: "PARTIAL_LIMIT_HIT",
      connection: { workspaceId: { in: workspaceIds } },
    },
  });

  const results = rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    connectionId: r.connection_id,
    connectionName: r.connection_name,
    endpoint: r.connection_endpoint,
    bucket: r.bucket,
    key: r.key,
    size: r.size.toString(),
    lastModified: r.last_modified.toISOString(),
    mime: r.mime,
    extension: r.extension,
    tags: r.tags,
    score: r.score,
    href: `/browser/${r.connection_id}/${r.bucket}/${dirOf(r.key)}`,
  }));

  return NextResponse.json({
    results,
    parsedQuery: {
      freeText: parsed.freeText,
      mime: parsed.mime,
      ext: parsed.ext,
      sizeMin: parsed.sizeMin?.toString(),
      sizeMax: parsed.sizeMax?.toString(),
      before: parsed.before?.toISOString(),
      after: parsed.after?.toISOString(),
      bucket: parsed.bucket,
      connection: parsed.connection,
      tag: parsed.tag,
    },
    partial: partialCount > 0,
  });
});
