import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getConnectionAccessById } from "@/lib/db/connections";
import { canAccessFeature } from "@/lib/subscriptions/gates";
import {
  createShareLink,
  listShareLinksByConnection,
} from "@/lib/db/share-links";
import { recordActivityWithBatch } from "@/lib/db/activity";
import { hashPassword } from "@/lib/share-links/password";
import { computeStatus } from "@/lib/share-links/status";

function displayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
  );
}

function publicUrl(req: NextRequest, slug: string): string {
  const host = req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}/s/${slug}`;
}

function toResponse(link: {
  id: string;
  slug: string;
  bucket: string;
  key: string;
  createdById: string | null;
  createdByDisplayName: string;
  createdByImageUrl: string | null;
  expiresAt: Date | null;
  passwordHash: string | null;
  maxUses: number | null;
  useCount: number;
  revokedAt: Date | null;
  description: string | null;
  createdAt: Date;
}) {
  return {
    id: link.id,
    slug: link.slug,
    bucket: link.bucket,
    key: link.key,
    createdById: link.createdById,
    createdByDisplayName: link.createdByDisplayName,
    createdByImageUrl: link.createdByImageUrl,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    hasPassword: link.passwordHash !== null,
    maxUses: link.maxUses,
    useCount: link.useCount,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    description: link.description,
    createdAt: link.createdAt.toISOString(),
    status: computeStatus(link, new Date()),
  };
}

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const tier = user.subscription?.tier ?? "FREE";
  if (!canAccessFeature(tier, "shareLinks")) {
    return NextResponse.json(
      { error: "Share links require a PRO subscription." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const {
    connectionId,
    bucket,
    key,
    expiresIn,
    password,
    maxUses,
    description,
    batchId,
  } = body as {
    connectionId?: string;
    bucket?: string;
    key?: string;
    expiresIn?: number | null;
    password?: string | null;
    maxUses?: number | null;
    description?: string | null;
    batchId?: string;
  };

  if (!connectionId || !bucket || !key) {
    return NextResponse.json(
      { error: "connectionId, bucket, and key are required" },
      { status: 400 }
    );
  }

  const access = await getConnectionAccessById(connectionId, user.id);
  if (!access) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const expiresAt =
    typeof expiresIn === "number" && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

  const passwordHash =
    typeof password === "string" && password.length > 0
      ? await hashPassword(password)
      : null;

  const created = await createShareLink({
    connectionId,
    bucket,
    key,
    createdById: user.id,
    createdByDisplayName: displayName(user),
    createdByImageUrl: user.imageUrl ?? null,
    expiresAt,
    passwordHash,
    maxUses: typeof maxUses === "number" && maxUses > 0 ? maxUses : null,
    description: typeof description === "string" ? description.trim() || null : null,
  });

  const activityResult = await recordActivityWithBatch({
    connectionId,
    userId: user.id,
    userDisplayName: displayName(user),
    userImageUrl: user.imageUrl ?? null,
    action: "SHARE_CREATED",
    bucket,
    key,
    batchId: typeof batchId === "string" ? batchId : null,
  });
  if (!activityResult.ok) {
    console.error("[activity] share-links-create-route lost audit row", { connectionId, bucket, key, reason: activityResult.reason });
  }

  return NextResponse.json({
    shareLink: toResponse(created),
    url: publicUrl(req, created.slug),
  });
});

export const GET = withAuth(async (req: NextRequest, { user }) => {
  const { searchParams } = req.nextUrl;
  const connectionId = searchParams.get("connectionId");
  const bucket = searchParams.get("bucket") ?? undefined;
  const key = searchParams.get("key") ?? undefined;

  if (!connectionId) {
    return NextResponse.json(
      { error: "connectionId is required" },
      { status: 400 }
    );
  }

  const access = await getConnectionAccessById(connectionId, user.id);
  if (!access) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const links = await listShareLinksByConnection(connectionId, { bucket, key });
  return NextResponse.json({ shareLinks: links.map(toResponse) });
});
