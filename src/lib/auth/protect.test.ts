import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("./mcp-token", () => ({
  resolveMcpToken: vi.fn(),
  TOKEN_PREFIX: "s3dock_pat_",
}));

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db/prisma";
import { resolveMcpToken } from "./mcp-token";
import { withAuth } from "./protect";

beforeEach(() => {
  vi.clearAllMocks();
});

const mockSubscription = { id: "sub-1", userId: "u1", tier: "FREE" };
const mockUser = {
  id: "u1",
  clerkId: "clerk_u1",
  email: "test@example.com",
  subscription: mockSubscription,
};

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/test", { headers });
}

describe("withAuth", () => {
  test("no auth header, valid Clerk session — handler called with user, returns 200", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: "clerk_u1" });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }, { status: 200 }));
    const wrapped = withAuth(handler);

    const res = await wrapped(makeReq());
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][1].user).toEqual(mockUser);
  });

  test("no auth header, no Clerk session — returns 401", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: null });

    const handler = vi.fn();
    const wrapped = withAuth(handler);

    const res = await wrapped(makeReq());
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  test("Bearer PAT valid token — handler called with patUser, auth() not called, returns 200", async () => {
    (resolveMcpToken as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }, { status: 200 }));
    const wrapped = withAuth(handler);

    const res = await wrapped(makeReq({ authorization: "Bearer s3dock_pat_abc123" }));
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][1].user).toEqual(mockUser);
    // Clerk must NOT be called when PAT path resolves
    expect(auth).not.toHaveBeenCalled();
  });

  test("Bearer PAT invalid token — returns 401, auth() not called", async () => {
    (resolveMcpToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const handler = vi.fn();
    const wrapped = withAuth(handler);

    const res = await wrapped(makeReq({ authorization: "Bearer s3dock_pat_bad" }));
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(auth).not.toHaveBeenCalled();
  });

  test("Bearer with non-PAT value — falls through to Clerk path (auth() called)", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: "clerk_u1" });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }, { status: 200 }));
    const wrapped = withAuth(handler);

    const res = await wrapped(makeReq({ authorization: "Bearer some-other-jwt" }));
    expect(res.status).toBe(200);
    // resolveMcpToken should not be called for a non-PAT Bearer token
    expect(resolveMcpToken).not.toHaveBeenCalled();
    // Clerk path should be used
    expect(auth).toHaveBeenCalledOnce();
  });
});
