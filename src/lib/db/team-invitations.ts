import prisma from "./prisma";
import { generateInviteToken, INVITE_TTL_DAYS } from "@/lib/teams/invite-token";
import type { TeamRole } from "@/generated/prisma/client";

export async function createInvitation({
  teamId,
  role,
  email,
  createdById,
}: {
  teamId: string;
  role: TeamRole;
  email?: string | null;
  createdById: string;
}) {
  const token = generateInviteToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

  return prisma.teamInvitation.create({
    data: {
      teamId,
      role,
      token,
      email: email ?? null,
      createdById,
      expiresAt,
    },
  });
}

export async function listPendingInvitations(teamId: string) {
  return prisma.teamInvitation.findMany({
    where: {
      teamId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getInvitationByToken(token: string) {
  return prisma.teamInvitation.findUnique({
    where: { token },
    include: { team: true },
  });
}

export async function revokeInvitation(inviteId: string) {
  return prisma.teamInvitation.update({
    where: { id: inviteId },
    data: { revokedAt: new Date() },
  });
}
