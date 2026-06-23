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
vi.mock("@/lib/search/index-ops", () => ({
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

const sourceAccess = {
  connection: { id: UUID, endpoint: "https://s3.example.com" },
  role: "EDITOR",
  workspaceId: "ws-1",
  workspaceType: "PERSONAL",
};
const targetAccess = {
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

describe("POST /api/objects/copy", () => {
  test("400 on missing sourceConnectionId (non-uuid body)", async () => {
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
      .mockResolvedValueOnce(sourceAccess) // source found
      .mockResolvedValueOnce(null); // target not found
    const req = buildPostRequest({ body: validBody });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(404);
    const body = await (res as Response).json();
    expect(body.error).toBe("Target connection not found");
  });

  test("403 when target role is VIEWER (write denied)", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sourceAccess) // source has read access
      .mockResolvedValueOnce({ ...targetAccess, role: "VIEWER" }); // target VIEWER
    const req = buildPostRequest({ body: validBody });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(403);
    const body = await (res as Response).json();
    expect(body.error).toBe("You do not have permission to write to the target connection");
  });

  test("200 happy path: source VIEWER allowed for read, target EDITOR", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    (createS3Client as ReturnType<typeof vi.fn>).mockReturnValue({ send });
    (getConnectionAccessById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ...sourceAccess, role: "VIEWER" }) // VIEWER OK for source read
      .mockResolvedValueOnce(targetAccess); // EDITOR OK for target write
    const req = buildPostRequest({ body: validBody });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(200);
    const body = await (res as Response).json();
    expect(body.summary).toBeDefined();
  });

  test("200 happy path: same-endpoint copy", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    (createS3Client as ReturnType<typeof vi.fn>).mockReturnValue({ send });
    const sameEndpointSource = { ...sourceAccess, connection: { ...sourceAccess.connection, endpoint: "https://same.example.com" } };
    const sameEndpointTarget = { ...targetAccess, connection: { ...targetAccess.connection, endpoint: "https://same.example.com" } };
    (getConnectionAccessById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sameEndpointSource)
      .mockResolvedValueOnce(sameEndpointTarget);
    const req = buildPostRequest({ body: validBody });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(200);
  });

  test("400 on missing sourceKeys", async () => {
    const req = buildPostRequest({ body: { ...validBody, sourceKeys: [] } });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(400);
  });
});
