import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { isTeamAdmin } from "@/lib/db/teams";
import type { TeamRole } from "@/generated/prisma/client";
import { isTeamRole } from "@/lib/roles";

type RouteContext = { params: Promise<{ teamId: string; memberId: string }> };

async function countAdmins(teamId: string): Promise<number> {
  return prisma.teamMember.count({
    where: {
      teamId,
      role: "ADMIN",
    },
  });
}

export const PATCH = withAuth<RouteContext>(async (req, { user, params }) => {
  const { teamId, memberId } = params;
  const canManage = await isTeamAdmin(teamId, user.id);

  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: { role?: TeamRole } = await req.json();
  const role = body.role;

  if (!role || !isTeamRole(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const member = await prisma.teamMember.findUnique({ where: { id: memberId } });
  if (!member || member.teamId !== teamId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (member.role === "ADMIN" && role !== "ADMIN") {
    const adminCount = await countAdmins(teamId);
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Team must have at least one admin" },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.teamMember.update({
    where: { id: memberId },
    data: { role },
  });

  return NextResponse.json({
    id: updated.id,
    userId: updated.userId,
    role: updated.role,
  });
});

export const DELETE = withAuth<RouteContext>(async (_req, { user, params }) => {
  const { teamId, memberId } = params;

  const member = await prisma.teamMember.findUnique({ where: { id: memberId } });
  if (!member || member.teamId !== teamId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const isSelf = member.userId === user.id;
  const canManage = await isTeamAdmin(teamId, user.id);

  if (!canManage && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (member.role === "ADMIN") {
    const adminCount = await countAdmins(teamId);
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Team must have at least one admin" },
        { status: 400 }
      );
    }
  }

  await prisma.teamMember.delete({ where: { id: memberId } });

  return NextResponse.json({ success: true });
});
