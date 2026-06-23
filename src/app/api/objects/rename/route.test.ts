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
vi.mock("@/lib/db/activity", () => ({
  recordActivity: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  default: { fileNote: { updateMany: vi.fn() } },
}));
vi.mock("@/lib/search/index-ops", () => ({
  indexRename: vi.fn(),
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

const editorAccess = {
  connection: { id: UUID },
  role: "EDITOR",
  workspaceId: "ws-1",
  workspaceType: "PERSONAL",
};

beforeEach(() => {
  vi.clearAllMocks();
  (meterOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ allowed: true });
});

describe("POST /api/objects/rename", () => {
  test("400 on missing connectionId (non-uuid body)", async () => {
    const req = buildPostRequest({ body: { bucket: "b", sourceKey: "old.txt", targetKey: "new.txt" } });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(400);
  });

  test("400 on empty sourceKey", async () => {
    const req = buildPostRequest({ body: { connectionId: UUID, bucket: "b", sourceKey: "", targetKey: "new.txt" } });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(400);
  });

  test("200 with skipped:true when sourceKey === targetKey", async () => {
    const req = buildPostRequest({ body: { connectionId: UUID, bucket: "b", sourceKey: "same.txt", targetKey: "same.txt" } });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(200);
    const body = await (res as Response).json();
    expect(body.skipped).toBe(true);
  });

  test("400 when sourceKey is a folder (ends with /)", async () => {
    const req = buildPostRequest({ body: { connectionId: UUID, bucket: "b", sourceKey: "folder/", targetKey: "folder2/" } });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(400);
    const body = await (res as Response).json();
    expect(body.error).toContain("Folder rename");
  });

  test("404 when access lookup returns null", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const req = buildPostRequest({ body: { connectionId: UUID, bucket: "b", sourceKey: "old.txt", targetKey: "new.txt" } });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(404);
  });

  test("403 when role is VIEWER", async () => {
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...editorAccess,
      role: "VIEWER",
    });
    const req = buildPostRequest({ body: { connectionId: UUID, bucket: "b", sourceKey: "old.txt", targetKey: "new.txt" } });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(403);
  });

  test("200 when role is EDITOR; S3 copy+delete issued", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    (createS3Client as ReturnType<typeof vi.fn>).mockReturnValueOnce({ send });
    (getConnectionAccessById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(editorAccess);
    const req = buildPostRequest({ body: { connectionId: UUID, bucket: "b", sourceKey: "old.txt", targetKey: "new.txt" } });
    const res = await callPOST(req, { user: buildAuthUser() });
    expect((res as Response).status).toBe(200);
    // CopyObjectCommand + DeleteObjectCommand = 2 sends
    expect(send).toHaveBeenCalledTimes(2);
  });
});
