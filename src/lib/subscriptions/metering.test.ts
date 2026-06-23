import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the module under test
vi.mock("@/lib/db/prisma", () => ({
  default: {
    usageRecord: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import prisma from "@/lib/db/prisma";
import { meterOperation } from "./metering";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("meterOperation", () => {
  test("under limit: returns allowed:true and records one operation", async () => {
    (prisma.usageRecord.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      operationCount: 100,
    });
    (prisma.usageRecord.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await meterOperation("user-1", "FREE");

    expect(result.allowed).toBe(true);
    expect(prisma.usageRecord.upsert).toHaveBeenCalledOnce();
  });

  test("at limit (FREE, 1000 ops): returns allowed:false, reason mentions limit, upsert NOT called", async () => {
    (prisma.usageRecord.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      operationCount: 1000,
    });

    const result = await meterOperation("user-1", "FREE");

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("1,000");
    expect(result.current).toBe(1000);
    expect(result.limit).toBe(1000);
    expect(prisma.usageRecord.upsert).not.toHaveBeenCalled();
  });

  test("ENTERPRISE (unlimited): returns allowed:true, upsert called, findUnique NOT called", async () => {
    (prisma.usageRecord.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await meterOperation("user-1", "ENTERPRISE");

    expect(result.allowed).toBe(true);
    expect(prisma.usageRecord.upsert).toHaveBeenCalledOnce();
    expect(prisma.usageRecord.findUnique).not.toHaveBeenCalled();
  });
});
