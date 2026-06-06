import { describe, test, expect, vi, beforeEach } from "vitest";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

vi.mock("@/lib/search/index-ops", () => ({
  indexBulkUpsert: vi.fn().mockResolvedValue(undefined),
}));

import { indexBulkUpsert } from "@/lib/search/index-ops";
import { runCrawlTick } from "./walk";

beforeEach(() => {
  vi.clearAllMocks();
});

function fakeClient(pagesByBucket: Record<string, Array<{ Contents: Array<{ Key: string; Size: number; LastModified: Date; ETag?: string }>; IsTruncated: boolean; NextContinuationToken?: string }>>) {
  const callIndex: Record<string, number> = {};
  return {
    send: vi.fn(async (cmd: unknown) => {
      if (cmd instanceof ListObjectsV2Command) {
        const bucket = (cmd.input as { Bucket: string }).Bucket;
        const idx = callIndex[bucket] ?? 0;
        callIndex[bucket] = idx + 1;
        return pagesByBucket[bucket][idx];
      }
      throw new Error("unexpected command");
    }),
  } as never;
}

describe("runCrawlTick", () => {
  test("walks one bucket to completion when small", async () => {
    const client = fakeClient({
      "b1": [
        {
          Contents: [
            { Key: "a.png", Size: 100, LastModified: new Date("2026-06-01") },
            { Key: "b.txt", Size: 200, LastModified: new Date("2026-06-02") },
          ],
          IsTruncated: false,
        },
      ],
    });

    const state = {
      workspaceId: "w1",
      connectionId: "c1",
      currentBucket: "b1",
      bucketsRemaining: [] as string[],
      nextContinuationToken: null as string | null,
      objectsIndexed: 0,
    };
    const result = await runCrawlTick(client, state, {
      now: () => 1000,
      maxPages: 10,
      maxMs: 10_000,
      hardCap: 2_000_000,
    });
    expect(result.done).toBe(true);
    expect(result.partialLimitHit).toBe(false);
    expect(result.state.currentBucket).toBeNull();
    expect(result.state.objectsIndexed).toBe(2);
    expect(indexBulkUpsert).toHaveBeenCalledOnce();
  });

  test("respects maxPages and persists continuation token", async () => {
    const pages = Array.from({ length: 5 }, (_, i) => ({
      Contents: [{ Key: `k${i}`, Size: 1, LastModified: new Date("2026-06-01") }],
      IsTruncated: i < 4,
      NextContinuationToken: i < 4 ? `tok-${i + 1}` : undefined,
    }));
    const client = fakeClient({ "b1": pages });

    const state = {
      workspaceId: "w1",
      connectionId: "c1",
      currentBucket: "b1",
      bucketsRemaining: [] as string[],
      nextContinuationToken: null as string | null,
      objectsIndexed: 0,
    };
    const result = await runCrawlTick(client, state, {
      now: () => 1000,
      maxPages: 2,
      maxMs: 10_000,
      hardCap: 2_000_000,
    });
    expect(result.done).toBe(false);
    expect(result.state.nextContinuationToken).toBe("tok-2");
    expect(result.state.objectsIndexed).toBe(2);
  });

  test("advances to next bucket when current finishes", async () => {
    const client = fakeClient({
      "b1": [{ Contents: [{ Key: "x", Size: 1, LastModified: new Date() }], IsTruncated: false }],
      "b2": [{ Contents: [{ Key: "y", Size: 1, LastModified: new Date() }], IsTruncated: false }],
    });
    const state = {
      workspaceId: "w1",
      connectionId: "c1",
      currentBucket: "b1",
      bucketsRemaining: ["b2"],
      nextContinuationToken: null as string | null,
      objectsIndexed: 0,
    };
    const result = await runCrawlTick(client, state, {
      now: () => 1000,
      maxPages: 10,
      maxMs: 10_000,
      hardCap: 2_000_000,
    });
    expect(result.done).toBe(true);
    expect(result.state.objectsIndexed).toBe(2);
  });

  test("marks PARTIAL_LIMIT_HIT when cap reached", async () => {
    const client = fakeClient({
      "b1": [
        {
          Contents: Array.from({ length: 5 }, (_, i) => ({
            Key: `k${i}`,
            Size: 1,
            LastModified: new Date(),
          })),
          IsTruncated: true,
          NextContinuationToken: "tok",
        },
      ],
    });
    const state = {
      workspaceId: "w1",
      connectionId: "c1",
      currentBucket: "b1",
      bucketsRemaining: [] as string[],
      nextContinuationToken: null as string | null,
      objectsIndexed: 1_999_998,
    };
    const result = await runCrawlTick(client, state, {
      now: () => 1000,
      maxPages: 10,
      maxMs: 10_000,
      hardCap: 2_000_000,
    });
    expect(result.partialLimitHit).toBe(true);
    expect(result.state.objectsIndexed).toBeGreaterThanOrEqual(2_000_000);
  });
});
