import { describe, test, expect } from "vitest";
import {
  DeleteObjectsRequest,
  CopyObjectsRequest,
  MoveObjectsRequest,
  RenameObjectRequest,
} from "./objects";

const UUID = "00000000-0000-0000-0000-000000000000";

describe("DeleteObjectsRequest", () => {
  test("accepts a minimal valid body", () => {
    const result = DeleteObjectsRequest.safeParse({
      connectionId: UUID,
      bucket: "my-bucket",
      keys: ["a.txt"],
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty keys array", () => {
    const result = DeleteObjectsRequest.safeParse({
      connectionId: UUID,
      bucket: "my-bucket",
      keys: [],
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-uuid connectionId", () => {
    const result = DeleteObjectsRequest.safeParse({
      connectionId: "not-a-uuid",
      bucket: "my-bucket",
      keys: ["a.txt"],
    });
    expect(result.success).toBe(false);
  });

  test("rejects keys array with more than 1000 entries", () => {
    const result = DeleteObjectsRequest.safeParse({
      connectionId: UUID,
      bucket: "my-bucket",
      keys: Array.from({ length: 1001 }, (_, i) => `file-${i}.txt`),
    });
    expect(result.success).toBe(false);
  });

  test("accepts multiple keys", () => {
    const result = DeleteObjectsRequest.safeParse({
      connectionId: UUID,
      bucket: "my-bucket",
      keys: ["a.txt", "b.txt", "folder/c.txt"],
    });
    expect(result.success).toBe(true);
  });
});

describe("CopyObjectsRequest", () => {
  test("accepts a minimal valid body", () => {
    const result = CopyObjectsRequest.safeParse({
      sourceConnectionId: UUID,
      sourceBucket: "src-bucket",
      sourceKeys: ["file.txt"],
      targetConnectionId: UUID,
      targetBucket: "dst-bucket",
      targetPath: "",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty sourceKeys", () => {
    const result = CopyObjectsRequest.safeParse({
      sourceConnectionId: UUID,
      sourceBucket: "src-bucket",
      sourceKeys: [],
      targetConnectionId: UUID,
      targetBucket: "dst-bucket",
      targetPath: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-uuid sourceConnectionId", () => {
    const result = CopyObjectsRequest.safeParse({
      sourceConnectionId: "bad-id",
      sourceBucket: "src-bucket",
      sourceKeys: ["file.txt"],
      targetConnectionId: UUID,
      targetBucket: "dst-bucket",
      targetPath: "",
    });
    expect(result.success).toBe(false);
  });

  test("accepts targetPath as empty string (root)", () => {
    const result = CopyObjectsRequest.safeParse({
      sourceConnectionId: UUID,
      sourceBucket: "src",
      sourceKeys: ["k.txt"],
      targetConnectionId: UUID,
      targetBucket: "dst",
      targetPath: "",
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing targetBucket", () => {
    const result = CopyObjectsRequest.safeParse({
      sourceConnectionId: UUID,
      sourceBucket: "src",
      sourceKeys: ["k.txt"],
      targetConnectionId: UUID,
      targetPath: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("MoveObjectsRequest", () => {
  test("accepts a valid move body (same shape as copy)", () => {
    const result = MoveObjectsRequest.safeParse({
      sourceConnectionId: UUID,
      sourceBucket: "src-bucket",
      sourceKeys: ["file.txt"],
      targetConnectionId: UUID,
      targetBucket: "dst-bucket",
      targetPath: "folder/",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty sourceKeys", () => {
    const result = MoveObjectsRequest.safeParse({
      sourceConnectionId: UUID,
      sourceBucket: "src",
      sourceKeys: [],
      targetConnectionId: UUID,
      targetBucket: "dst",
      targetPath: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("RenameObjectRequest", () => {
  test("accepts a valid rename body", () => {
    const result = RenameObjectRequest.safeParse({
      connectionId: UUID,
      bucket: "my-bucket",
      sourceKey: "old-name.txt",
      targetKey: "new-name.txt",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty sourceKey", () => {
    const result = RenameObjectRequest.safeParse({
      connectionId: UUID,
      bucket: "my-bucket",
      sourceKey: "",
      targetKey: "new-name.txt",
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-uuid connectionId", () => {
    const result = RenameObjectRequest.safeParse({
      connectionId: "bad",
      bucket: "my-bucket",
      sourceKey: "old.txt",
      targetKey: "new.txt",
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing targetKey", () => {
    const result = RenameObjectRequest.safeParse({
      connectionId: UUID,
      bucket: "my-bucket",
      sourceKey: "old.txt",
    });
    expect(result.success).toBe(false);
  });
});
