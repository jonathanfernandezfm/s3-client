import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: never) => handler,
}));
vi.mock("@/lib/db/teams", () => ({
  isTeamAdmin: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  default: {
    teamMember: {
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { DELETE } from "./route";
import { buildAuthUser, type MockedRouteHandler } from "@/lib/test-utils/api-route";
import { isTeamAdmin } from "@/lib/db/teams";
import prisma from "@/lib/db/prisma";
import type { NextRequest } from "next/server";

function buildEmptyRequest(): NextRequest {
  return {
    url: "http://localhost/api/teams/team-1/members/member-1",
    json: async () => ({}),
  } as unknown as NextRequest;
}

const callDELETE = DELETE as unknown as MockedRouteHandler;

const TEAM_ID = "team-1";
const VIEWER_USER_ID = "user-viewer";
const ADMIN_USER_ID = "user-admin";
const OTHER_USER_ID = "user-other";

const VIEWER_MEMBER_ID = "member-viewer";
const ADMIN_MEMBER_ID = "member-admin";
const OTHER_MEMBER_ID = "member-other";

// withAuth is mocked as identity so handler receives params already-resolved
function makeParams(memberId: string) {
  return { params: { teamId: TEAM_ID, memberId } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/teams/[teamId]/members/[memberId] — leave and remove", () => {
  test("200: a VIEWER can remove their own membership (leave)", async () => {
    (isTeamAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (prisma.teamMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: VIEWER_MEMBER_ID,
      teamId: TEAM_ID,
      userId: VIEWER_USER_ID,
      role: "VIEWER",
    });
    (prisma.teamMember.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: VIEWER_MEMBER_ID });

    const req = buildEmptyRequest();
    const res = await callDELETE(req, {
      user: buildAuthUser({ id: VIEWER_USER_ID }),
      ...makeParams(VIEWER_MEMBER_ID),
    });
    expect((res as Response).status).toBe(200);
    const body = await (res as Response).json();
    expect(body.success).toBe(true);
  });

  test("403: a VIEWER cannot remove another member's membership", async () => {
    (isTeamAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (prisma.teamMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: OTHER_MEMBER_ID,
      teamId: TEAM_ID,
      userId: OTHER_USER_ID,
      role: "VIEWER",
    });

    const req = buildEmptyRequest();
    const res = await callDELETE(req, {
      user: buildAuthUser({ id: VIEWER_USER_ID }),
      ...makeParams(OTHER_MEMBER_ID),
    });
    expect((res as Response).status).toBe(403);
    expect(prisma.teamMember.delete).not.toHaveBeenCalled();
  });

  test("400: sole admin cannot leave (last-admin protection)", async () => {
    (isTeamAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    (prisma.teamMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: ADMIN_MEMBER_ID,
      teamId: TEAM_ID,
      userId: ADMIN_USER_ID,
      role: "ADMIN",
    });
    // Only 1 admin — last-admin protection fires
    (prisma.teamMember.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);

    const req = buildEmptyRequest();
    const res = await callDELETE(req, {
      user: buildAuthUser({ id: ADMIN_USER_ID }),
      ...makeParams(ADMIN_MEMBER_ID),
    });
    expect((res as Response).status).toBe(400);
    const body = await (res as Response).json();
    expect(body.error).toMatch(/admin/i);
    expect(prisma.teamMember.delete).not.toHaveBeenCalled();
  });

  test("200: admin with 2+ admins can remove another admin", async () => {
    (isTeamAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    (prisma.teamMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: OTHER_MEMBER_ID,
      teamId: TEAM_ID,
      userId: OTHER_USER_ID,
      role: "ADMIN",
    });
    // 2 admins — removal is safe
    (prisma.teamMember.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(2);
    (prisma.teamMember.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: OTHER_MEMBER_ID });

    const req = buildEmptyRequest();
    const res = await callDELETE(req, {
      user: buildAuthUser({ id: ADMIN_USER_ID }),
      ...makeParams(OTHER_MEMBER_ID),
    });
    expect((res as Response).status).toBe(200);
  });

  test("404: member not found", async () => {
    (isTeamAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (prisma.teamMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = buildEmptyRequest();
    const res = await callDELETE(req, {
      user: buildAuthUser({ id: VIEWER_USER_ID }),
      ...makeParams("nonexistent-member"),
    });
    expect((res as Response).status).toBe(404);
  });
});
