import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the module under test
vi.mock("@/lib/db/prisma", () => ({
  default: {
    usageRecord: {
      findUnique: vi.fn(),
    },
    connection: {
      count: vi.fn(),
    },
    team: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import prisma from "@/lib/db/prisma";
import {
  canPerformOperation,
  canCreateTeam,
  canAddTeamMember,
} from "./check-limits";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// canPerformOperation
// ---------------------------------------------------------------------------

describe("canPerformOperation", () => {
  test("under limit: returns allowed:true", async () => {
    (prisma.usageRecord.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      operationCount: 500,
    });

    const result = await canPerformOperation("user-1", "FREE");
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(500);
    expect(result.limit).toBe(1000);
  });

  test("at limit (FREE, 1000 ops): returns allowed:false", async () => {
    (prisma.usageRecord.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      operationCount: 1000,
    });

    const result = await canPerformOperation("user-1", "FREE");
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(1000);
    expect(result.limit).toBe(1000);
    expect(result.reason).toContain("1,000");
  });

  test("ENTERPRISE (unlimited): returns allowed:true without querying DB", async () => {
    const result = await canPerformOperation("user-1", "ENTERPRISE");
    expect(result.allowed).toBe(true);
    expect(prisma.usageRecord.findUnique).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// canCreateTeam
// ---------------------------------------------------------------------------

describe("canCreateTeam", () => {
  test("PRO with 0 existing teams: allowed", async () => {
    (prisma.team.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const result = await canCreateTeam("user-1", "PRO");
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
    expect(result.limit).toBe(1);
  });

  test("PRO with 1 existing team: blocked (maxTeams = 1)", async () => {
    (prisma.team.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const result = await canCreateTeam("user-1", "PRO");
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(1);
    expect(result.limit).toBe(1);
    expect(result.reason).toBeDefined();
  });

  test("ENTERPRISE: allowed without counting", async () => {
    const result = await canCreateTeam("user-1", "ENTERPRISE");
    expect(result.allowed).toBe(true);
    expect(prisma.team.count).not.toHaveBeenCalled();
  });

  test("FREE: blocked (maxTeams = 0, teams not enabled)", async () => {
    const result = await canCreateTeam("user-1", "FREE");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("FREE");
    expect(prisma.team.count).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// canAddTeamMember
// ---------------------------------------------------------------------------

describe("canAddTeamMember", () => {
  const makeTeam = (tier: string, memberCount: number) => ({
    id: "team-1",
    createdBy: {
      subscription: { tier },
    },
    _count: { members: memberCount },
  });

  test("PRO creator with 4 members: allowed (limit is 5)", async () => {
    (prisma.team.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTeam("PRO", 4)
    );

    const result = await canAddTeamMember("team-1");
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(4);
    expect(result.limit).toBe(5);
  });

  test("PRO creator with 5 members: blocked (limit is 5)", async () => {
    (prisma.team.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTeam("PRO", 5)
    );

    const result = await canAddTeamMember("team-1");
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(5);
    expect(result.limit).toBe(5);
    expect(result.reason).toBeDefined();
  });

  test("ENTERPRISE creator: allowed without counting", async () => {
    (prisma.team.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTeam("ENTERPRISE", 50)
    );

    const result = await canAddTeamMember("team-1");
    expect(result.allowed).toBe(true);
  });

  test("no subscription row (null): treated as FREE, blocked (maxMembersPerTeam = 0)", async () => {
    (prisma.team.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "team-1",
      createdBy: { subscription: null },
      _count: { members: 0 },
    });

    const result = await canAddTeamMember("team-1");
    expect(result.allowed).toBe(false);
  });

  test("team not found: blocked", async () => {
    (prisma.team.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await canAddTeamMember("team-nonexistent");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not found");
  });
});
