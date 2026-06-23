import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: never) => handler,
}));
vi.mock("@/lib/db/team-invitations", () => ({
  getInvitationByToken: vi.fn(),
}));
vi.mock("@/lib/db/teams", () => ({
  getTeamMembership: vi.fn(),
}));
vi.mock("@/lib/subscriptions", () => ({
  canAddTeamMember: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  default: {
    $transaction: vi.fn(),
    teamInvitation: {
      update: vi.fn(),
    },
  },
}));

import { POST } from "./route";
import { buildPostRequest, buildAuthUser } from "@/lib/test-utils/api-route";
import type { NextRequest } from "next/server";
import type { AuthUser } from "@/lib/auth/clerk";
import { getInvitationByToken } from "@/lib/db/team-invitations";
import { getTeamMembership } from "@/lib/db/teams";
import { canAddTeamMember } from "@/lib/subscriptions";
import prisma from "@/lib/db/prisma";

type ParamsHandler = (
  req: NextRequest,
  ctx: { user: AuthUser; params: Record<string, string> }
) => Promise<Response>;

const callPOST = POST as unknown as ParamsHandler;

const now = new Date();
const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

const baseInvite = {
  id: "invite-1",
  teamId: "team-1",
  team: { id: "team-1", name: "Acme" },
  role: "VIEWER" as const,
  token: "abc123",
  email: null,
  createdById: "admin-1",
  acceptedAt: null,
  revokedAt: null,
  expiresAt: future,
  createdAt: now,
};

const user = buildAuthUser({ id: "user-2" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/teams/invites/[token]/accept", () => {
  test("404 when invite does not exist", async () => {
    (getInvitationByToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const req = buildPostRequest({ body: {} });
    const res = await callPOST(req, { user, params: { token: "bad" } });
    expect((res as Response).status).toBe(404);
  });

  test("410 when invite is revoked", async () => {
    (getInvitationByToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...baseInvite,
      revokedAt: new Date(),
    });
    const req = buildPostRequest({ body: {} });
    const res = await callPOST(req, { user, params: { token: "abc" } });
    expect((res as Response).status).toBe(410);
    const body = await (res as Response).json();
    expect(body.error).toMatch(/revoked/i);
  });

  test("410 when invite has already been accepted", async () => {
    (getInvitationByToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...baseInvite,
      acceptedAt: new Date(),
    });
    const req = buildPostRequest({ body: {} });
    const res = await callPOST(req, { user, params: { token: "abc" } });
    expect((res as Response).status).toBe(410);
    const body = await (res as Response).json();
    expect(body.error).toMatch(/already been used/i);
  });

  test("410 when invite is expired", async () => {
    (getInvitationByToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...baseInvite,
      expiresAt: new Date(Date.now() - 1000),
    });
    const req = buildPostRequest({ body: {} });
    const res = await callPOST(req, { user, params: { token: "abc" } });
    expect((res as Response).status).toBe(410);
    const body = await (res as Response).json();
    expect(body.error).toMatch(/expired/i);
  });

  test("200 with alreadyMember:true when user is already a member (idempotent)", async () => {
    (getInvitationByToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(baseInvite);

    const existingMembership = { id: "m-1", teamId: "team-1", userId: user.id, role: "VIEWER" };

    // $transaction calls the callback with a tx object
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        // We need getTeamMembership to return existing inside the tx callback
        (getTeamMembership as ReturnType<typeof vi.fn>).mockResolvedValueOnce(existingMembership);
        const mockTx = {
          teamInvitation: { update: vi.fn().mockResolvedValue({}) },
          teamMember: { create: vi.fn() },
        };
        return fn(mockTx);
      }
    );

    const req = buildPostRequest({ body: {} });
    const res = await callPOST(req, { user, params: { token: "abc" } });
    expect((res as Response).status).toBe(200);
    const body = await (res as Response).json();
    expect(body.alreadyMember).toBe(true);
    expect(body.teamId).toBe("team-1");
  });

  test("403 when seat cap is reached at accept time", async () => {
    (getInvitationByToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(baseInvite);

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        (getTeamMembership as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
        (canAddTeamMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          allowed: false,
          reason: "Seat cap reached",
        });
        const mockTx = {
          teamInvitation: { update: vi.fn() },
          teamMember: { create: vi.fn() },
        };
        return fn(mockTx);
      }
    );

    const req = buildPostRequest({ body: {} });
    const res = await callPOST(req, { user, params: { token: "abc" } });
    expect((res as Response).status).toBe(403);
    const body = await (res as Response).json();
    expect(body.error).toMatch(/seat cap/i);
  });

  test("200 with role when valid non-member accepts invite", async () => {
    (getInvitationByToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(baseInvite);

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        (getTeamMembership as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
        (canAddTeamMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ allowed: true });
        const mockTx = {
          teamInvitation: { update: vi.fn().mockResolvedValue({}) },
          teamMember: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(mockTx);
      }
    );

    const req = buildPostRequest({ body: {} });
    const res = await callPOST(req, { user, params: { token: "abc" } });
    expect((res as Response).status).toBe(200);
    const body = await (res as Response).json();
    expect(body.teamId).toBe("team-1");
    expect(body.role).toBe("VIEWER");
    expect(body.alreadyMember).toBeUndefined();
  });

  test("handles race condition (P2002 unique violation) as idempotent already-member", async () => {
    (getInvitationByToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(baseInvite);

    const p2002Error = Object.assign(new Error("Unique constraint"), { code: "P2002" });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(p2002Error);
    (prisma.teamInvitation.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const req = buildPostRequest({ body: {} });
    const res = await callPOST(req, { user, params: { token: "abc" } });
    expect((res as Response).status).toBe(200);
    const body = await (res as Response).json();
    expect(body.alreadyMember).toBe(true);
  });
});
