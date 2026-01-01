import prisma from "./prisma";
import type { Connection } from "@/generated/prisma/client";

export type ConnectionInput = {
  name?: string | null;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
};

export type ConnectionUpdate = Partial<ConnectionInput>;

export async function getAllConnections(): Promise<Connection[]> {
  return prisma.connection.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function getConnectionById(
  id: string
): Promise<Connection | null> {
  return prisma.connection.findUnique({
    where: { id },
  });
}

export async function createConnection(
  data: ConnectionInput
): Promise<Connection> {
  return prisma.connection.create({
    data: {
      name: data.name,
      endpoint: data.endpoint,
      region: data.region,
      accessKeyId: data.accessKeyId,
      secretAccessKey: data.secretAccessKey,
      forcePathStyle: data.forcePathStyle ?? true,
    },
  });
}

export async function updateConnection(
  id: string,
  data: ConnectionUpdate
): Promise<Connection> {
  return prisma.connection.update({
    where: { id },
    data,
  });
}

export async function deleteConnection(id: string): Promise<Connection> {
  return prisma.connection.delete({
    where: { id },
  });
}
