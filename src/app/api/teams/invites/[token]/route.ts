import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getInvitationByToken } from "@/lib/db/team-invitations";

type RouteContext = { params: Promise<{ token: string }> };

export const GET = withAuth<RouteContext>(async (_req, { params }) => {
  const { token } = params;

  const invite = await getInvitationByToken(token);

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.revokedAt) {
    return NextResponse.json(
      { error: "This invite has been revoked" },
      { status: 410 }
    );
  }

  if (invite.acceptedAt) {
    return NextResponse.json(
      { error: "This invite has already been used" },
      { status: 410 }
    );
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This invite has expired" },
      { status: 410 }
    );
  }

  return NextResponse.json({
    teamId: invite.teamId,
    teamName: invite.team.name,
    role: invite.role,
  });
});
