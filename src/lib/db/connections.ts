import prisma from "./prisma";
import type { Connection, Workspace } from "@/generated/prisma/client";
import { encrypt, decrypt } from "@/lib/crypto";
import type { Role } from "@/lib/roles";

export type ConnectionInput = {
  name?: string | null;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
};

export type ConnectionUpdate = Partial<ConnectionInput>;

export type ConnectionRole = Role;

export type WorkspaceAccess = {
  workspace: Workspace;
  role: ConnectionRole;
};

export type ConnectionAccess = {
  connection: Connection;
  workspaceId: string;
  workspaceType: "PERSONAL" | "TEAM";
  role: ConnectionRole;
};

function getRoleForWorkspace(
  userId: string,
  workspace: {
    type: "PERSONAL" | "TEAM";
    userId: string | null;
    team: { members: Array<{ role: Role }> } | null;
  }
): ConnectionRole | null {
  if (workspace.type === "PERSONAL") {
    return workspace.userId === userId ? "ADMIN" : null;
  }

  return workspace.team?.members[0]?.role ?? null;
}

export async function ensurePersonalWorkspace(userId: string): Promise<Workspace> {
  return prisma.workspace.upsert({
    where: { userId },
    update: {},
    create: {
      type: "PERSONAL",
      userId,
    },
  });
}

export async function getWorkspaceAccess(
  workspaceId: string,
  userId: string
): Promise<WorkspaceAccess | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      team: {
        include: {
          members: {
            where: { userId },
            select: { role: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!workspace) {
    return null;
  }

  const role = getRoleForWorkspace(userId, workspace);
  if (!role) {
    return null;
  }

  return { workspace, role };
}

/**
 * Get all connections a user can access.
 * Optionally scope by workspace ID.
 */
export async function getConnectionsByUserId(
  userId: string,
  workspaceId?: string
): Promise<Connection[]> {
  if (workspaceId) {
    const access = await getWorkspaceAccess(workspaceId, userId);
    if (!access) {
      return [];
    }

    return prisma.connection.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
  }

  return prisma.connection.findMany({
    where: {
      OR: [
        {
          workspace: {
            type: "PERSONAL",
            userId,
          },
        },
        {
          workspace: {
            type: "TEAM",
            team: {
              members: {
                some: { userId },
              },
            },
          },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Resolve connection access for a user, including role.
 */
export async function getConnectionAccessById(
  id: string,
  userId: string
): Promise<ConnectionAccess | null> {
  const connection = await prisma.connection.findUnique({
    where: { id },
    include: {
      workspace: {
        include: {
          team: {
            include: {
              members: {
                where: { userId },
                select: { role: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!connection) {
    return null;
  }

  const role = getRoleForWorkspace(userId, connection.workspace);
  if (!role) {
    return null;
  }

  return {
    connection: {
      id: connection.id,
      name: connection.name,
      endpoint: connection.endpoint,
      region: connection.region,
      accessKeyId: connection.accessKeyId,
      secretAccessKey: decrypt(connection.secretAccessKey),
      forcePathStyle: connection.forcePathStyle,
      workspaceId: connection.workspaceId,
      createdById: connection.createdById,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    },
    workspaceId: connection.workspace.id,
    workspaceType: connection.workspace.type,
    role,
  };
}

/**
 * Get a connection by ID with read access.
 */
export async function getConnectionById(
  id: string,
  userId: string
): Promise<Connection | null> {
  const access = await getConnectionAccessById(id, userId);
  return access?.connection ?? null;
}

/**
 * Create a new connection in a workspace.
 * If workspaceId is omitted, uses the user's personal workspace.
 */
export async function createConnection(
  userId: string,
  data: ConnectionInput,
  workspaceId?: string
): Promise<Connection> {
  let targetWorkspaceId = workspaceId;

  if (!targetWorkspaceId) {
    const personalWorkspace = await ensurePersonalWorkspace(userId);
    targetWorkspaceId = personalWorkspace.id;
  } else {
    const access = await getWorkspaceAccess(targetWorkspaceId, userId);
    if (!access || access.role !== "ADMIN") {
      throw new Error("Forbidden workspace access");
    }
  }

  return prisma.connection.create({
    data: {
      workspaceId: targetWorkspaceId,
      createdById: userId,
      name: data.name,
      endpoint: data.endpoint,
      region: data.region,
      accessKeyId: data.accessKeyId,
      secretAccessKey: encrypt(data.secretAccessKey),
      forcePathStyle: data.forcePathStyle ?? true,
    },
  });
}

/**
 * Update a connection, requiring ADMIN role.
 */
export async function updateConnection(
  id: string,
  userId: string,
  data: ConnectionUpdate
): Promise<Connection | null> {
  const access = await getConnectionAccessById(id, userId);
  if (!access || access.role !== "ADMIN") {
    return null;
  }

  const credentialFields: Array<keyof ConnectionUpdate> = [
    "endpoint",
    "accessKeyId",
    "secretAccessKey",
    "region",
    "forcePathStyle",
  ];
  const credentialsChanged = credentialFields.some((field) => {
    const next = data[field];
    if (next === undefined) return false;
    const current = (access.connection as Record<string, unknown>)[field];
    return next !== current;
  });

  const updateData = { ...data };
  if (updateData.secretAccessKey) {
    updateData.secretAccessKey = encrypt(updateData.secretAccessKey);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (credentialsChanged) {
      await tx.connectionHealthCheck.deleteMany({ where: { connectionId: id } });
      await tx.bucketHealthCheck.deleteMany({ where: { connectionId: id } });
    }
    return tx.connection.update({
      where: { id },
      data: updateData,
    });
  });

  if (credentialsChanged) {
    const { runConnectionHealthCheck } = await import("@/lib/health/runner");
    runConnectionHealthCheck(id).catch((err) => {
      console.error(
        `[health] re-run after credential edit failed for ${id}:`,
        err,
      );
    });
  }

  return updated;
}

/**
 * Delete a connection, requiring ADMIN role.
 */
export async function deleteConnection(
  id: string,
  userId: string
): Promise<Connection | null> {
  const access = await getConnectionAccessById(id, userId);
  if (!access || access.role !== "ADMIN") {
    return null;
  }

  return prisma.connection.delete({
    where: { id },
  });
}
