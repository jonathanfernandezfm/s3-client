import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function ensureUniqueSlug(base: string): Promise<string> {
  const safeBase = base || "team";
  let slug = safeBase;
  let i = 1;

  while (true) {
    const existing = await prisma.team.findUnique({ where: { slug } });
    if (!existing) return slug;
    i += 1;
    slug = `${safeBase}-${i}`;
  }
}

export const GET = withAuth(async (_req, { user }) => {
  const memberships = await prisma.teamMember.findMany({
    where: { userId: user.id },
    include: {
      team: {
        include: {
          workspace: true,
          _count: {
            select: {
              members: true,
            },
          },
        },
      },
    },
    orderBy: {
      team: {
        name: "asc",
      },
    },
  });

  const teams = memberships
    .filter((membership) => membership.team.workspace)
    .map((membership) => ({
      id: membership.team.id,
      name: membership.team.name,
      slug: membership.team.slug,
      role: membership.role,
      workspaceId: membership.team.workspace!.id,
      memberCount: membership.team._count.members,
      createdAt: membership.team.createdAt,
    }));

  return NextResponse.json(teams);
});

export const POST = withAuth(async (req, { user }) => {
  const body: { name?: string; slug?: string } = await req.json();
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: "Team name is required" }, { status: 400 });
  }

  const slugBase = slugify(body.slug?.trim() || name);
  const slug = await ensureUniqueSlug(slugBase);

  const created = await prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: {
        name,
        slug,
        createdById: user.id,
      },
    });

    const workspace = await tx.workspace.create({
      data: {
        type: "TEAM",
        teamId: team.id,
      },
    });

    await tx.teamMember.create({
      data: {
        teamId: team.id,
        userId: user.id,
        role: "ADMIN",
      },
    });

    return { team, workspace };
  });

  return NextResponse.json({
    id: created.team.id,
    name: created.team.name,
    slug: created.team.slug,
    role: "ADMIN",
    workspaceId: created.workspace.id,
    memberCount: 1,
    createdAt: created.team.createdAt,
  });
});
