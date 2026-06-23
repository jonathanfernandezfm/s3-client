import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: never) => handler,
}));
vi.mock("@/lib/db/connections", () => ({
  getConnectionAccessById: vi.fn(),
}));
vi.mock("@/lib/s3/client", () => ({
  createS3Client: vi.fn(),
}));
vi.mock("@/lib/s3/copy-source", () => ({
  buildCopySource: vi.fn().mockReturnValue("bucket/key"),
}));
vi.mock("@/lib/s3/copy-fidelity", () => ({
  buildFidelityParams: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/db/activity", () => ({
  recordActivityBatch: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/db/prisma", () => ({
  default: { fileNote: { updateMany: vi.fn() } },
}));
vi.mock("@/lib/search/index-ops", () => ({
  indexBulkDelete: vi.fn(),
  indexBulkUpsert: vi.fn(),
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
const UUID2 = "ffffffff-ffff-ffff-ffff-ffffffffffff";

const editorAccess = {
  connection: { id: UUID, endpoint: "https://s3.example.com" },
  role: "EDITOR",
  workspaceId: "ws-1",
  workspaceType: "PERSONAL",
};
const editorAccess2 = {
  connection: { id: UUID2, endpoint: "https://s3.example.com" },
  role: "EDITOR",
  workspaceId: "ws-1",
  workspaceType: "PERSONAL",
};

const validBody = {
  sourceConnectionId: UUID,
  sourceBucket: "src-bucket",
  sourceKeys: ["file.txt"],
  targetConnectionId: UUID2,
  targetBucket: "dst-bucket",
  targetPath: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  (meterOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ allowed: true });
});

describe("POST /api/objects/move", () => {
  test("400 on invalid body (non-uuid sourceConnectionId)", async () => {
    const req = buildPostRequest({ body: { sourceBucket: "b", sourceKeys: ["k"], targetConnectionId: UUID2, targetBucket: "d", targetPath: "" } });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(400);
  });

  test("404 when source access lookup returns null", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const req = buildPostRequest({ body: validBody });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(404);
    const body = await (res as Response).json();
    expect(body.error).toBe("Source connection not found");
  });

  test("404 when target access lookup returns null", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(editorAccess)
      .mockResolvedValueOnce(null);
    const req = buildPostRequest({ body: validBody });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(404);
    const body = await (res as Response).json();
    expect(body.error).toBe("Target connection not found");
  });

  test("403 when source role is VIEWER (write denied on source)", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ...editorAccess, role: "VIEWER" });
    const req = buildPostRequest({ body: validBody });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(403);
    const body = await (res as Response).json();
    expect(body.error).toBe("You do not have permission to move objects between these connections");
  });

  test("403 when target role is VIEWER (write denied on target)", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(editorAccess)
      .mockResolvedValueOnce({ ...editorAccess2, role: "VIEWER" });
    const req = buildPostRequest({ body: validBody });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(403);
    const body = await (res as Response).json();
    expect(body.error).toBe("You do not have permission to move objects between these connections");
  });

  test("200 happy path: both EDITOR, same endpoint", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    (createS3Client as ReturnType<typeof vi.fn>).mockReturnValue({ send });
    (getConnectionAccessById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(editorAccess)
      .mockResolvedValueOnce(editorAccess2);
    const req = buildPostRequest({ body: validBody });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(200);
    const body = await (res as Response).json();
    expect(body.summary).toBeDefined();
  });

  test("400 on empty sourceKeys", async () => {
    const req = buildPostRequest({ body: { ...validBody, sourceKeys: [] } });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(400);
  });
});
