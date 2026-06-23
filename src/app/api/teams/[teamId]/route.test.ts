import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: never) => handler,
}));
vi.mock("@/lib/db/teams", () => ({
  getTeamMembership: vi.fn(),
  isTeamAdmin: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  default: {
    team: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { PATCH, DELETE } from "./route";
import { buildAuthUser, type MockedRouteHandler } from "@/lib/test-utils/api-route";
import { isTeamAdmin, getTeamMembership } from "@/lib/db/teams";
import prisma from "@/lib/db/prisma";
import type { NextRequest } from "next/server";

function buildJsonRequest(body: unknown): NextRequest {
  return {
    url: "http://localhost/api/teams/team-1",
    json: async () => body,
  } as unknown as NextRequest;
}

function buildEmptyRequest(): NextRequest {
  return {
    url: "http://localhost/api/teams/team-1",
    json: async () => ({}),
  } as unknown as NextRequest;
}

const callPATCH = PATCH as unknown as MockedRouteHandler;
const callDELETE = DELETE as unknown as MockedRouteHandler;

const TEAM_ID = "team-1";
const CREATOR_ID = "user-creator";
const ADMIN_ID = "user-admin";

// withAuth is mocked as identity so handler receives params already-resolved
const routeParams = { params: { teamId: TEAM_ID } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/teams/[teamId] — rename", () => {
  test("200: admin can rename the team", async () => {
    (isTeamAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    (prisma.team.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: TEAM_ID,
      name: "New Name",
    });

    const req = buildJsonRequest({ name: "New Name" });
    const res = await callPATCH(req, { user: buildAuthUser({ id: ADMIN_ID }), ...routeParams });
    expect((res as Response).status).toBe(200);
    const body = await (res as Response).json();
    expect(body.name).toBe("New Name");
  });

  test("403: non-admin cannot rename", async () => {
    (isTeamAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    const req = buildJsonRequest({ name: "New Name" });
    const res = await callPATCH(req, { user: buildAuthUser({ id: "viewer-user" }), ...routeParams });
    expect((res as Response).status).toBe(403);
  });

  test("400: empty name is rejected", async () => {
    (isTeamAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

    const req = buildJsonRequest({ name: "   " });
    const res = await callPATCH(req, { user: buildAuthUser({ id: ADMIN_ID }), ...routeParams });
    expect((res as Response).status).toBe(400);
  });

  test("400: missing name field", async () => {
    (isTeamAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

    const req = buildJsonRequest({});
    const res = await callPATCH(req, { user: buildAuthUser({ id: ADMIN_ID }), ...routeParams });
    expect((res as Response).status).toBe(400);
  });
});

describe("DELETE /api/teams/[teamId] — delete team", () => {
  test("200: creator can delete the team", async () => {
    (prisma.team.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: TEAM_ID,
      createdById: CREATOR_ID,
    });
    (prisma.team.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: TEAM_ID });

    const req = buildEmptyRequest();
    const res = await callDELETE(req, { user: buildAuthUser({ id: CREATOR_ID }), ...routeParams });
    expect((res as Response).status).toBe(200);
    const body = await (res as Response).json();
    expect(body.success).toBe(true);
  });

  test("403: non-creator admin cannot delete the team", async () => {
    (prisma.team.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: TEAM_ID,
      createdById: CREATOR_ID,
    });

    const req = buildEmptyRequest();
    const res = await callDELETE(req, { user: buildAuthUser({ id: ADMIN_ID }), ...routeParams });
    expect((res as Response).status).toBe(403);
    expect(prisma.team.delete).not.toHaveBeenCalled();
  });

  test("404: team not found", async () => {
    (prisma.team.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = buildEmptyRequest();
    const res = await callDELETE(req, { user: buildAuthUser({ id: CREATOR_ID }), ...routeParams });
    expect((res as Response).status).toBe(404);
  });
});

// Keep getTeamMembership in scope to avoid TS unused-import warning
void getTeamMembership;
