import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  default: {
    connection: { findMany: vi.fn() },
    workspace: { findUnique: vi.fn() },
  },
}));

const decryptSpy = vi.fn();
vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn(),
  decrypt: (...args: unknown[]) => decryptSpy(...args),
}));

import prisma from "@/lib/db/prisma";
import { listConnectionsWithAccess } from "./connections";

beforeEach(() => {
  vi.clearAllMocks();
  decryptSpy.mockReset();
});

const personalRow = {
  id: "c1", name: "Personal", endpoint: "https://e", region: "us-east-1",
  accessKeyId: "AK", secretAccessKey: "ENC", forcePathStyle: true,
  workspaceId: "ws1", createdById: "u1",
  createdAt: new Date(0), updatedAt: new Date(0),
  workspace: { id: "ws1", type: "PERSONAL", userId: "u1", team: null },
};

const teamRow = {
  id: "c2", name: "Team", endpoint: "https://e2", region: "eu-west-1",
  accessKeyId: "AK2", secretAccessKey: "ENC2", forcePathStyle: false,
  workspaceId: "ws2", createdById: "u9",
  createdAt: new Date(0), updatedAt: new Date(0),
  workspace: { id: "ws2", type: "TEAM", userId: null, team: { members: [{ role: "VIEWER" }] } },
};

describe("listConnectionsWithAccess", () => {
  test("resolves all connections in a single findMany (no N+1)", async () => {
    (prisma.connection.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([personalRow, teamRow] as any[]);

    const result = await listConnectionsWithAccess("u1");

    expect(prisma.connection.findMany).toHaveBeenCalledOnce();
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("ADMIN");      // PERSONAL owner
    expect(result[1].role).toBe("VIEWER");     // TEAM member role
    expect(result[1].workspaceType).toBe("TEAM");
  });

  test("never decrypts secrets for the list view", async () => {
    (prisma.connection.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([personalRow] as any[]);
    await listConnectionsWithAccess("u1");
    expect(decryptSpy).not.toHaveBeenCalled();
  });

  test("filters out connections where the user has no role", async () => {
    const foreignPersonal = { ...personalRow, workspace: { id: "ws9", type: "PERSONAL", userId: "someone-else", team: null } };
    (prisma.connection.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([foreignPersonal] as any[]);
    const result = await listConnectionsWithAccess("u1");
    expect(result).toHaveLength(0);
  });
});
