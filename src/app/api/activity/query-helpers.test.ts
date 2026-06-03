import { describe, test, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  buildWhereClause,
  parseLimit,
  escapeLike,
} from "./query-helpers";

describe("encodeCursor / decodeCursor", () => {
  test("round-trips a cursor with createdAt and id", () => {
    const date = new Date("2026-06-03T10:00:00.000Z");
    const id = "abc-123";
    const encoded = encodeCursor(date, id);
    const decoded = decodeCursor(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.createdAt.toISOString()).toBe(date.toISOString());
    expect(decoded!.id).toBe(id);
  });

  test("decodeCursor returns null for invalid base64", () => {
    expect(decodeCursor("not-valid-base64!!!")).toBeNull();
  });

  test("decodeCursor returns null for valid base64 but wrong shape", () => {
    const bad = Buffer.from(JSON.stringify({ foo: "bar" })).toString("base64url");
    expect(decodeCursor(bad)).toBeNull();
  });

  test("decodeCursor returns null for empty string", () => {
    expect(decodeCursor("")).toBeNull();
  });
});

describe("parseLimit", () => {
  test("returns default 50 when param is absent", () => {
    expect(parseLimit(null)).toBe(50);
  });

  test("parses a valid positive integer", () => {
    expect(parseLimit("20")).toBe(20);
  });

  test("clamps values above 200 to 200", () => {
    expect(parseLimit("999")).toBe(200);
  });

  test("falls back to 50 for non-numeric input", () => {
    expect(parseLimit("abc")).toBe(50);
  });

  test("falls back to 50 for zero", () => {
    expect(parseLimit("0")).toBe(50);
  });

  test("falls back to 50 for negative numbers", () => {
    expect(parseLimit("-10")).toBe(50);
  });
});

describe("escapeLike", () => {
  test("escapes percent signs", () => {
    expect(escapeLike("100%")).toBe("100\\%");
  });

  test("escapes underscores", () => {
    expect(escapeLike("file_name")).toBe("file\\_name");
  });

  test("escapes backslashes first (so they are not double-escaped)", () => {
    expect(escapeLike("back\\slash")).toBe("back\\\\slash");
  });

  test("leaves normal characters unchanged", () => {
    expect(escapeLike("processed/2024/Q4/")).toBe("processed/2024/Q4/");
  });
});

describe("buildWhereClause", () => {
  const base = { connectionId: "conn-1", bucket: "my-bucket" };

  test("returns connectionId and bucket filter at minimum", () => {
    const where = buildWhereClause(base);
    expect(where.connectionId).toBe("conn-1");
    expect(where.bucket).toBe("my-bucket");
  });

  test("adds exact key filter when key param is provided", () => {
    const where = buildWhereClause({ ...base, key: "folder/file.txt" });
    expect(where.key).toEqual({ equals: "folder/file.txt" });
  });

  test("adds LIKE prefix filter when prefix is provided", () => {
    const where = buildWhereClause({ ...base, prefix: "processed/2024/" });
    expect(where.key).toEqual({ startsWith: "processed/2024/" });
  });

  test("key takes precedence over prefix when both provided", () => {
    const where = buildWhereClause({ ...base, key: "exact.txt", prefix: "some/" });
    expect(where.key).toEqual({ equals: "exact.txt" });
  });

  test("adds userId filter", () => {
    const where = buildWhereClause({ ...base, userId: "user-42" });
    expect(where.userId).toBe("user-42");
  });

  test("adds action filter as IN clause", () => {
    const where = buildWhereClause({ ...base, actions: ["UPLOAD", "DELETE"] });
    expect(where.action).toEqual({ in: ["UPLOAD", "DELETE"] });
  });

  test("adds cursor predicate using AND with OR for tiebreaker", () => {
    const cursorCreatedAt = new Date("2026-06-03T10:00:00.000Z");
    const where = buildWhereClause({ ...base, cursor: { createdAt: cursorCreatedAt, id: "row-id" } });
    expect(where.OR).toBeDefined();
    // OR covers: (same createdAt AND id < cursor id) OR (createdAt < cursor createdAt)
    expect(where.OR).toHaveLength(2);
  });

  test("escapes special LIKE characters in prefix", () => {
    const where = buildWhereClause({ ...base, prefix: "has%under_score/" });
    expect((where.key as { startsWith: string }).startsWith).toBe("has\\%under\\_score/");
  });
});
