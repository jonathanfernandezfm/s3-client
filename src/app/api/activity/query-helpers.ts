import type { ActivityAction } from "@/generated/prisma/client";

export type Cursor = { createdAt: Date; id: string };

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString("base64url");
}

export function decodeCursor(encoded: string): Cursor | null {
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") return null;
    const createdAt = new Date(parsed.createdAt);
    if (isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export function parseLimit(param: string | null): number {
  if (!param) return 50;
  const n = parseInt(param, 10);
  if (isNaN(n) || n <= 0) return 50;
  return Math.min(n, 200);
}

export function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

type WhereParams = {
  connectionId: string;
  bucket: string;
  prefix?: string | null;
  key?: string | null;
  userId?: string | null;
  actions?: string[] | null;
  cursor?: Cursor | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildWhereClause(params: WhereParams): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {
    connectionId: params.connectionId,
    bucket: params.bucket,
  };

  if (params.key) {
    where.key = { equals: params.key };
  } else if (params.prefix) {
    where.key = { startsWith: escapeLike(params.prefix) };
  }

  if (params.userId) {
    where.userId = params.userId;
  }

  if (params.actions && params.actions.length > 0) {
    where.action = { in: params.actions as ActivityAction[] };
  }

  if (params.cursor) {
    const { createdAt, id } = params.cursor;
    where.OR = [
      { createdAt: { equals: createdAt }, id: { lt: id } },
      { createdAt: { lt: createdAt } },
    ];
  }

  return where;
}
