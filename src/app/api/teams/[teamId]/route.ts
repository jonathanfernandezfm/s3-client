import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { getTeamMembership, isTeamAdmin } from "@/lib/db/teams";

type RouteContext = { params: Promise<{ teamId: string }> };

export const GET = withAuth<RouteContext>(async (_req, { user, params }) => {
  const { teamId } = params;

  const membership = await getTeamMembership(teamId, user.id);
  if (!membership) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      workspace: true,
      members: {
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
        orderBy: [
          { role: "asc" },
          { createdAt: "asc" },
        ],
      },
    },
  });

  if (!team || !team.workspace) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: team.id,
    name: team.name,
    slug: team.slug,
    role: membership.role,
    currentMemberId: membership.id,
    workspaceId: team.workspace.id,
    members: team.members.map((member) => ({
      id: member.id,
      userId: member.userId,
      role: member.role,
      email: member.user.email,
      firstName: member.user.firstName,
      lastName: member.user.lastName,
      imageUrl: member.user.imageUrl,
    })),
  });
});

export const PATCH = withAuth<RouteContext>(async (req, { user, params }) => {
  const { teamId } = params;

  const canManage = await isTeamAdmin(teamId, user.id);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: { name?: string } = await req.json();
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: { name },
  });

  return NextResponse.json({ id: updated.id, name: updated.name });
});

export const DELETE = withAuth<RouteContext>(async (_req, { user, params }) => {
  const { teamId } = params;

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  if (team.createdById !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.team.delete({ where: { id: teamId } });

  return NextResponse.json({ success: true });
});
