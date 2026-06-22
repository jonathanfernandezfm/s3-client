import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getConnectionAccessById } from "@/lib/db/connections";
import {
  getShareLinkById,
  getShareLinkWithEvents,
  editShareLink,
  revokeShareLink,
} from "@/lib/db/share-links";
import { recordActivity } from "@/lib/db/activity";
import { hashPassword } from "@/lib/share-links/password";
import { computeStatus } from "@/lib/share-links/status";

type RouteContext = { params: Promise<{ id: string }> };

function displayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
  );
}

async function loadAndAuthorize(id: string, userId: string) {
  const link = await getShareLinkById(id);
  if (!link) return { error: "not-found" as const };
  const access = await getConnectionAccessById(link.connectionId, userId);
  if (!access) return { error: "not-found" as const };
  return { link, access };
}

export const GET = withAuth<RouteContext>(async (_req, { user, params }) => {
  const { id } = await params;
  const linkBase = await loadAndAuthorize(id, user.id);
  if ("error" in linkBase) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }
  const full = await getShareLinkWithEvents(id);
  if (!full) return NextResponse.json({ error: "Share link not found" }, { status: 404 });

  return NextResponse.json({
    shareLink: {
      id: full.id,
      slug: full.slug,
      bucket: full.bucket,
      key: full.key,
      createdById: full.createdById,
      createdByDisplayName: full.createdByDisplayName,
      createdByImageUrl: full.createdByImageUrl,
      expiresAt: full.expiresAt?.toISOString() ?? null,
      hasPassword: full.passwordHash !== null,
      maxUses: full.maxUses,
      useCount: full.useCount,
      revokedAt: full.revokedAt?.toISOString() ?? null,
      description: full.description,
      createdAt: full.createdAt.toISOString(),
      status: computeStatus(full, new Date()),
    },
    events: full.events.map((e) => ({
      id: e.id,
      action: e.action,
      ip: e.ip,
      userAgent: e.userAgent,
      referrer: e.referrer,
      createdAt: e.createdAt.toISOString(),
    })),
  });
});

export const PATCH = withAuth<RouteContext>(async (req, { user, params }) => {
  const { id } = await params;
  const linkBase = await loadAndAuthorize(id, user.id);
  if ("error" in linkBase) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }

  const body = await req.json();
  const { expiresAt, password, maxUses, description } = body as {
    expiresAt?: string | null;
    password?: string | null;
    maxUses?: number | null;
    description?: string | null;
  };

  const patch: Parameters<typeof editShareLink>[1] = {};
  if (expiresAt !== undefined) {
    patch.expiresAt = expiresAt === null ? null : new Date(expiresAt);
  }
  if (password !== undefined) {
    patch.passwordHash =
      password === null || password === "" ? null : await hashPassword(password);
  }
  if (maxUses !== undefined) {
    patch.maxUses = maxUses === null || maxUses <= 0 ? null : maxUses;
  }
  if (description !== undefined) {
    patch.description = description === null ? null : description.trim() || null;
  }

  const updated = await editShareLink(id, patch);
  return NextResponse.json({
    shareLink: {
      id: updated.id,
      slug: updated.slug,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      hasPassword: updated.passwordHash !== null,
      maxUses: updated.maxUses,
      description: updated.description,
      status: computeStatus(updated, new Date()),
    },
  });
});

export const DELETE = withAuth<RouteContext>(async (_req, { user, params }) => {
  const { id } = await params;
  const linkBase = await loadAndAuthorize(id, user.id);
  if ("error" in linkBase) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }

  const revoked = await revokeShareLink(id);
  const activityResult = await recordActivity({
    connectionId: linkBase.link.connectionId,
    userId: user.id,
    userDisplayName: displayName(user),
    userImageUrl: user.imageUrl ?? null,
    action: "SHARE_REVOKED",
    bucket: linkBase.link.bucket,
    key: linkBase.link.key,
  });
  if (!activityResult.ok) {
    console.error("[activity] share-link-revoke-route lost audit row", { connectionId: linkBase.link.connectionId, reason: activityResult.reason });
  }

  return NextResponse.json({ revokedAt: revoked.revokedAt?.toISOString() ?? null });
});
