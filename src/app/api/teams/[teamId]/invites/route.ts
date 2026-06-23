import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { isTeamAdmin } from "@/lib/db/teams";
import { canAddTeamMember } from "@/lib/subscriptions";
import { isTeamRole } from "@/lib/roles";
import {
  createInvitation,
  listPendingInvitations,
} from "@/lib/db/team-invitations";
import type { TeamRole } from "@/generated/prisma/client";

type RouteContext = { params: Promise<{ teamId: string }> };

export const POST = withAuth<RouteContext>(async (req, { user, params }) => {
  const { teamId } = params;

  const canManage = await isTeamAdmin(teamId, user.id);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const memberCheck = await canAddTeamMember(teamId);
  if (!memberCheck.allowed) {
    return NextResponse.json({ error: memberCheck.reason }, { status: 403 });
  }

  const body: { role?: TeamRole; email?: string } = await req.json();
  const role = body.role ?? "VIEWER";
  const email = body.email?.trim().toLowerCase() ?? null;

  if (!isTeamRole(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const invite = await createInvitation({
    teamId,
    role,
    email,
    createdById: user.id,
  });

  const host = req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const url = `${proto}://${host}/app/teams/join/${invite.token}`;

  return NextResponse.json({
    id: invite.id,
    role: invite.role,
    token: invite.token,
    url,
    expiresAt: invite.expiresAt,
  });
});

export const GET = withAuth<RouteContext>(async (req, { user, params }) => {
  const { teamId } = params;

  const canManage = await isTeamAdmin(teamId, user.id);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invites = await listPendingInvitations(teamId);

  const host = req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? "http";

  return NextResponse.json(
    invites.map((invite) => ({
      id: invite.id,
      role: invite.role,
      email: invite.email,
      url: `${proto}://${host}/app/teams/join/${invite.token}`,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    }))
  );
});
