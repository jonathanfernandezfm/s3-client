import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { isTeamAdmin } from "@/lib/db/teams";
import type { TeamRole } from "@/generated/prisma/client";

type RouteContext = { params: Promise<{ teamId: string }> };

export const POST = withAuth<RouteContext>(async (req, { user, params }) => {
  const { teamId } = params;
  const canManage = await isTeamAdmin(teamId, user.id);

  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: { email?: string; role?: TeamRole } = await req.json();
  const email = body.email?.trim().toLowerCase();
  const role = body.role ?? "VIEWER";

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  if (role !== "ADMIN" && role !== "VIEWER") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({ where: { email } });
  if (!targetUser) {
    return NextResponse.json(
      { error: "User not found. They must sign in at least once before being added." },
      { status: 404 }
    );
  }

  const existing = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId,
        userId: targetUser.id,
      },
    },
  });

  if (existing) {
    return NextResponse.json({ error: "User is already a member" }, { status: 409 });
  }

  const member = await prisma.teamMember.create({
    data: {
      teamId,
      userId: targetUser.id,
      role,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          imageUrl: true,
        },
      },
    },
  });

  return NextResponse.json({
    id: member.id,
    userId: member.userId,
    role: member.role,
    email: member.user.email,
    firstName: member.user.firstName,
    lastName: member.user.lastName,
    imageUrl: member.user.imageUrl,
  });
});
