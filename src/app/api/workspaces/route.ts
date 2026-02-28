import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";

export const GET = withAuth(async (_req, { user }) => {
  const personalWorkspace = await prisma.workspace.findUnique({
    where: { userId: user.id },
  });


  const memberships = await prisma.teamMember.findMany({
    where: { userId: user.id },
    include: {
      team: {
        include: {
          workspace: true,
        },
      },
    },
    orderBy: {
      team: {
        name: "asc",
      },
    },
  });

  const items = [
    ...(personalWorkspace
      ? [
          {
            id: personalWorkspace.id,
            type: personalWorkspace.type,
            name: "Personal",
            role: "ADMIN" as const,
          },
        ]
      : []),
    ...memberships
      .filter((membership) => membership.team.workspace)
      .map((membership) => ({
        id: membership.team.workspace!.id,
        type: membership.team.workspace!.type,
        name: membership.team.name,
        role: membership.role,
      })),
  ];

  return NextResponse.json(items);
});
