import prisma from "./prisma";

export async function getTeamMembership(teamId: string, userId: string) {
  return prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId,
        userId,
      },
    },
  });
}

export async function isTeamAdmin(teamId: string, userId: string): Promise<boolean> {
  const membership = await getTeamMembership(teamId, userId);
  return membership?.role === "ADMIN";
}
