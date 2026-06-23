import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  // withAuth becomes identity: the handler receives our user directly.
  withAuth: (handler: never) => handler,
}));
vi.mock("@/lib/db/connections", () => ({
  getConnectionAccessById: vi.fn(),
}));
vi.mock("@/lib/s3/client", () => ({
  createS3Client: vi.fn(),
}));
vi.mock("@/lib/db/activity", () => ({
  recordActivityBatch: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  default: { fileNote: { deleteMany: vi.fn() } },
}));
vi.mock("@/lib/search/index-ops", () => ({
  indexBulkDelete: vi.fn(),
}));
vi.mock("@/lib/subscriptions", () => ({
  meterOperation: vi.fn(),
}));

import { POST } from "./route";
import { buildPostRequest, buildAuthUser, type MockedRouteHandler } from "@/lib/test-utils/api-route";
import { getConnectionAccessById } from "@/lib/db/connections";
import { meterOperation } from "@/lib/subscriptions";
import { createS3Client } from "@/lib/s3/client";

const callPOST = POST as unknown as MockedRouteHandler;

const UUID = "00000000-0000-0000-0000-000000000000";

beforeEach(() => {
  vi.clearAllMocks();
  (meterOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ allowed: true });
});

describe("DELETE /api/objects/delete", () => {
  test("400 on missing connectionId (non-uuid body)", async () => {
    const req = buildPostRequest({ body: { bucket: "b", keys: ["k"] } });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(400);
  });

  test("400 on empty keys array", async () => {
    const req = buildPostRequest({ body: { connectionId: UUID, bucket: "b", keys: [] } });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(400);
  });

  test("404 when access lookup returns null", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const req = buildPostRequest({ body: { connectionId: UUID, bucket: "b", keys: ["k"] } });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(404);
  });

  test("403 when role is VIEWER", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      connection: { id: UUID },
      role: "VIEWER",
      workspaceId: "ws-1",
      workspaceType: "PERSONAL",
    });
    const req = buildPostRequest({ body: { connectionId: UUID, bucket: "b", keys: ["k"] } });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(403);
  });

  test("200 when role is EDITOR; S3 delete is issued", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    (createS3Client as ReturnType<typeof vi.fn>).mockReturnValueOnce({ send });
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      connection: { id: UUID },
      role: "EDITOR",
      workspaceId: "ws-1",
      workspaceType: "PERSONAL",
    });
    const req = buildPostRequest({ body: { connectionId: UUID, bucket: "b", keys: ["k1", "k2"] } });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
