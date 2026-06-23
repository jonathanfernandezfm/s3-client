import { describe, test, expect, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/db/connections", () => ({
  getConnectionAccessById: vi.fn(),
}));

import { getConnectionAccessById } from "@/lib/db/connections";
import { requireConnectionAccess } from "./require-connection-access";

const mockAccess = {
  connection: { id: "00000000-0000-0000-0000-000000000000" },
  workspaceId: "ws-1",
  workspaceType: "PERSONAL" as const,
  role: "VIEWER" as const,
};

describe("requireConnectionAccess", () => {
  test("null access → 404 with 'Connection not found'", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const result = await requireConnectionAccess("conn-1", "user-1", "write");
    expect(result).toBeInstanceOf(NextResponse);
    const res = result as NextResponse;
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Connection not found");
  });

  test("required 'write', role 'VIEWER' → 403 with modify objects phrasing", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...mockAccess,
      role: "VIEWER",
    });
    const result = await requireConnectionAccess("conn-1", "user-1", "write");
    expect(result).toBeInstanceOf(NextResponse);
    const res = result as NextResponse;
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("modify objects");
  });

  test("required 'write', role 'EDITOR' → returns { access }", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...mockAccess,
      role: "EDITOR",
    });
    const result = await requireConnectionAccess("conn-1", "user-1", "write");
    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as { access: typeof mockAccess }).access).toBeDefined();
  });

  test("required 'write', role 'ADMIN' → returns { access }", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...mockAccess,
      role: "ADMIN",
    });
    const result = await requireConnectionAccess("conn-1", "user-1", "write");
    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as { access: typeof mockAccess }).access).toBeDefined();
  });

  test("required 'admin', role 'EDITOR' → 403 with manage configuration phrasing", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...mockAccess,
      role: "EDITOR",
    });
    const result = await requireConnectionAccess("conn-1", "user-1", "admin");
    expect(result).toBeInstanceOf(NextResponse);
    const res = result as NextResponse;
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("manage configuration");
  });

  test("required 'admin', role 'ADMIN' → returns { access }", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...mockAccess,
      role: "ADMIN",
    });
    const result = await requireConnectionAccess("conn-1", "user-1", "admin");
    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as { access: typeof mockAccess }).access).toBeDefined();
  });

  test("required 'read', role 'VIEWER' → returns { access }", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...mockAccess,
      role: "VIEWER",
    });
    const result = await requireConnectionAccess("conn-1", "user-1", "read");
    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as { access: typeof mockAccess }).access).toBeDefined();
  });
});
