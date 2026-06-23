import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getInvitationByToken } from "@/lib/db/team-invitations";
import { getTeamMembership } from "@/lib/db/teams";
import { canAddTeamMember } from "@/lib/subscriptions";
import prisma from "@/lib/db/prisma";

type RouteContext = { params: Promise<{ token: string }> };

export const POST = withAuth<RouteContext>(async (_req, { user, params }) => {
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

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Check if already a member (idempotent path)
      const existing = await getTeamMembership(invite.teamId, user.id);

      if (existing) {
        // Mark accepted and return idempotent result
        await tx.teamInvitation.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date(), acceptedById: user.id },
        });
        return { teamId: invite.teamId, alreadyMember: true as const };
      }

      // Re-check seat cap at accept time
      const memberCheck = await canAddTeamMember(invite.teamId);
      if (!memberCheck.allowed) {
        throw Object.assign(new Error(memberCheck.reason ?? "Seat cap reached"), {
          status: 403,
        });
      }

      // Create member and mark invite accepted
      await tx.teamMember.create({
        data: {
          teamId: invite.teamId,
          userId: user.id,
          role: invite.role,
        },
      });

      await tx.teamInvitation.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date(), acceptedById: user.id },
      });

      return { teamId: invite.teamId, role: invite.role };
    });

    return NextResponse.json(result);
  } catch (err) {
    const error = err as Error & { status?: number; code?: string };

    // Unique constraint violation = race: another request added the member
    if (error.code === "P2002") {
      await prisma.teamInvitation.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date(), acceptedById: user.id },
      });
      return NextResponse.json({ teamId: invite.teamId, alreadyMember: true });
    }

    if (error.status === 403) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    throw err;
  }
});
