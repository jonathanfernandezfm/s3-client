import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { isTeamAdmin } from "@/lib/db/teams";
import { revokeInvitation } from "@/lib/db/team-invitations";
import prisma from "@/lib/db/prisma";

type RouteContext = { params: Promise<{ teamId: string; inviteId: string }> };

export const DELETE = withAuth<RouteContext>(async (_req, { user, params }) => {
  const { teamId, inviteId } = params;

  const canManage = await isTeamAdmin(teamId, user.id);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invite = await prisma.teamInvitation.findUnique({
    where: { id: inviteId },
  });

  if (!invite || invite.teamId !== teamId) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  await revokeInvitation(inviteId);

  return NextResponse.json({ success: true });
});
