import { describe, test, expect } from "vitest";
import { groupActivityEvents, type ActivityRow } from "./batch-grouping";
import type { ActivityEventResponse } from "@/lib/queries/activity";

function event(overrides: Partial<ActivityEventResponse> = {}): ActivityEventResponse {
  return {
    id: Math.random().toString(36).slice(2),
    userId: "user-1",
    userDisplayName: "Alice",
    userImageUrl: null,
    action: "DELETE",
    bucket: "my-bucket",
    key: "file.txt",
    targetKey: null,
    byteSize: null,
    batchId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("groupActivityEvents", () => {
  test("returns standalone rows for events with null batchId", () => {
    const events = [
      event({ id: "a", batchId: null }),
      event({ id: "b", batchId: null }),
    ];
    const rows = groupActivityEvents(events);
    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe("single");
    expect(rows[1].type).toBe("single");
  });

  test("folds consecutive events sharing (userId, action, batchId) into a batch row", () => {
    const events = [
      event({ id: "1", userId: "u1", action: "DELETE", batchId: "batch-x", key: "a.txt" }),
      event({ id: "2", userId: "u1", action: "DELETE", batchId: "batch-x", key: "b.txt" }),
      event({ id: "3", userId: "u1", action: "DELETE", batchId: "batch-x", key: "c.txt" }),
    ];
    const rows = groupActivityEvents(events);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("batch");
    if (rows[0].type === "batch") {
      expect(rows[0].children).toHaveLength(3);
    }
  });

  test("does not fold events with same batchId but different userId", () => {
    const events = [
      event({ id: "1", userId: "u1", action: "DELETE", batchId: "batch-x" }),
      event({ id: "2", userId: "u2", action: "DELETE", batchId: "batch-x" }),
    ];
    const rows = groupActivityEvents(events);
    expect(rows).toHaveLength(2);
  });

  test("does not fold events with same batchId but different action", () => {
    const events = [
      event({ id: "1", userId: "u1", action: "DELETE", batchId: "batch-x" }),
      event({ id: "2", userId: "u1", action: "COPY", batchId: "batch-x" }),
    ];
    const rows = groupActivityEvents(events);
    expect(rows).toHaveLength(2);
  });

  test("handles mixed: batch group followed by standalone", () => {
    const events = [
      event({ id: "1", userId: "u1", action: "DELETE", batchId: "batch-x", key: "a.txt" }),
      event({ id: "2", userId: "u1", action: "DELETE", batchId: "batch-x", key: "b.txt" }),
      event({ id: "3", batchId: null, action: "UPLOAD", key: "new.txt" }),
    ];
    const rows = groupActivityEvents(events);
    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe("batch");
    expect(rows[1].type).toBe("single");
  });

  test("standalone row holds the original event", () => {
    const e = event({ id: "solo", batchId: null, key: "file.txt" });
    const rows = groupActivityEvents([e]);
    expect(rows[0].type).toBe("single");
    if (rows[0].type === "single") {
      expect(rows[0].event.id).toBe("solo");
    }
  });

  test("batch row has count matching children length", () => {
    const events = [
      event({ id: "1", batchId: "b1", userId: "u", action: "DELETE" }),
      event({ id: "2", batchId: "b1", userId: "u", action: "DELETE" }),
    ];
    const rows = groupActivityEvents(events);
    if (rows[0].type === "batch") {
      expect(rows[0].count).toBe(2);
    }
  });

  test("returns empty array for empty input", () => {
    expect(groupActivityEvents([])).toHaveLength(0);
  });

  test("two separate batch groups don't get merged", () => {
    const events = [
      event({ id: "1", userId: "u", action: "DELETE", batchId: "b1" }),
      event({ id: "2", userId: "u", action: "DELETE", batchId: "b1" }),
      event({ id: "3", userId: "u", action: "COPY", batchId: "b2" }),
      event({ id: "4", userId: "u", action: "COPY", batchId: "b2" }),
    ];
    const rows = groupActivityEvents(events);
    expect(rows).toHaveLength(2);
    if (rows[0].type === "batch") expect(rows[0].children[0].batchId).toBe("b1");
    if (rows[1].type === "batch") expect(rows[1].children[0].batchId).toBe("b2");
  });
});

describe("ActivityRow type safety", () => {
  test("ActivityRow is a discriminated union with type: single | batch", () => {
    const rows: ActivityRow[] = groupActivityEvents([
      event({ batchId: null }),
      event({ batchId: "b1", userId: "u", action: "DELETE" }),
      event({ batchId: "b1", userId: "u", action: "DELETE" }),
    ]);
    for (const row of rows) {
      expect(["single", "batch"]).toContain(row.type);
    }
  });
});
