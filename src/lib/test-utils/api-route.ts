import type { NextRequest } from "next/server";
import type { AuthUser } from "@/lib/auth/clerk";

/** Type for a mocked route handler after `vi.mock("@/lib/auth")` unwraps withAuth. */
export type MockedRouteHandler = (
  req: NextRequest,
  ctx: { user: AuthUser }
) => Promise<Response>;

/**
 * Build a minimal NextRequest-like stand-in for a POST handler.
 * Mock `@/lib/auth/protect.withAuth` and `@/lib/db/prisma` separately
 * with `vi.mock(...)` in each test file.
 */
export function buildPostRequest(opts: {
  url?: string;
  body: unknown;
  headers?: Record<string, string>;
}): NextRequest {
  const url = opts.url ?? "http://localhost/api/test";
  return {
    url,
    nextUrl: new URL(url),
    headers: new Headers(opts.headers),
    json: async () => opts.body,
    formData: async () => {
      throw new Error("formData not supported in this harness");
    },
    text: async () => JSON.stringify(opts.body),
  } as unknown as NextRequest;
}

export function buildAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  // Default to a minimally-shaped user. Tests can override fields.
  return {
    id: "user-1",
    clerkId: "clerk_user_1",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    imageUrl: null,
    subscription: { tier: "PRO" } as never, // tighten the type if AuthUser exposes it
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as unknown as AuthUser;
}
