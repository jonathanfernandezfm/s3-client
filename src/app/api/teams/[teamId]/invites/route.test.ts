import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: never) => handler,
}));
vi.mock("@/lib/db/teams", () => ({
  isTeamAdmin: vi.fn(),
}));
vi.mock("@/lib/subscriptions", () => ({
  canAddTeamMember: vi.fn(),
}));
vi.mock("@/lib/db/team-invitations", () => ({
  createInvitation: vi.fn(),
  listPendingInvitations: vi.fn(),
}));

import { POST, GET } from "./route";
import { buildPostRequest, buildAuthUser } from "@/lib/test-utils/api-route";
import type { NextRequest } from "next/server";
import type { AuthUser } from "@/lib/auth/clerk";
import { isTeamAdmin } from "@/lib/db/teams";
import { canAddTeamMember } from "@/lib/subscriptions";
import { createInvitation, listPendingInvitations } from "@/lib/db/team-invitations";

type ParamsHandler = (
  req: NextRequest,
  ctx: { user: AuthUser; params: Record<string, string> }
) => Promise<Response>;

const callPOST = POST as unknown as ParamsHandler;
const callGET = GET as unknown as ParamsHandler;

const user = buildAuthUser({ id: "admin-1" });
const ctx = { user, params: { teamId: "team-1" } };

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/teams/[teamId]/invites", () => {
  test("403 when caller is not an admin", async () => {
    (isTeamAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const req = buildPostRequest({ body: { role: "VIEWER" } });
    const res = await callPOST(req, ctx);
    expect((res as Response).status).toBe(403);
  });

  test("403 when seat cap is reached", async () => {
    (isTeamAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    (canAddTeamMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      reason: "Seat cap reached",
    });
    const req = buildPostRequest({ body: { role: "VIEWER" } });
    const res = await callPOST(req, ctx);
    expect((res as Response).status).toBe(403);
  });

  test("400 on invalid role", async () => {
    (isTeamAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    (canAddTeamMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ allowed: true });
    const req = buildPostRequest({ body: { role: "SUPERUSER" } });
    const res = await callPOST(req, ctx);
    expect((res as Response).status).toBe(400);
  });

  test("200 returns invite with url on success", async () => {
    (isTeamAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    (canAddTeamMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ allowed: true });
    (createInvitation as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "invite-1",
      role: "VIEWER",
      token: "tok123",
      expiresAt: future,
    });

    const req = buildPostRequest({
      body: { role: "VIEWER" },
      url: "http://localhost/api/teams/team-1/invites",
    });
    const res = await callPOST(req, ctx);
    expect((res as Response).status).toBe(200);
    const body = await (res as Response).json();
    expect(body.token).toBe("tok123");
    expect(body.url).toContain("/app/teams/join/tok123");
    expect(body.id).toBe("invite-1");
  });
});

describe("GET /api/teams/[teamId]/invites", () => {
  test("403 when caller is not an admin", async () => {
    (isTeamAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const req = buildPostRequest({ body: {} });
    const res = await callGET(req, ctx);
    expect((res as Response).status).toBe(403);
  });

  test("200 returns list of pending invites", async () => {
    (isTeamAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    (listPendingInvitations as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: "invite-1",
        role: "EDITOR",
        email: "bob@example.com",
        token: "tok456",
        expiresAt: future,
        createdAt: new Date(),
      },
    ]);
    const req = buildPostRequest({
      body: {},
      url: "http://localhost/api/teams/team-1/invites",
    });
    const res = await callGET(req, ctx);
    expect((res as Response).status).toBe(200);
    const body = await (res as Response).json();
    expect(body).toHaveLength(1);
    expect(body[0].url).toContain("/app/teams/join/tok456");
    expect(body[0].email).toBe("bob@example.com");
  });
});
