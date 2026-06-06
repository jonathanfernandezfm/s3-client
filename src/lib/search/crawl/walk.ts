import { ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import { indexBulkUpsert, type IndexUpsertInput } from "@/lib/search/index-ops";

export type CrawlState = {
  workspaceId: string;
  connectionId: string;
  currentBucket: string | null;
  bucketsRemaining: string[];
  nextContinuationToken: string | null;
  objectsIndexed: number;
};

export type CrawlTickOpts = {
  now: () => number;       // injectable for tests
  maxPages: number;        // pages per tick
  maxMs: number;           // wall-clock budget per tick
  hardCap: number;         // total objects per connection (PARTIAL_LIMIT_HIT trigger)
};

export type CrawlTickResult = {
  done: boolean;
  partialLimitHit: boolean;
  state: CrawlState;
};

export async function runCrawlTick(
  client: S3Client,
  initialState: CrawlState,
  opts: CrawlTickOpts
): Promise<CrawlTickResult> {
  const state: CrawlState = { ...initialState, bucketsRemaining: [...initialState.bucketsRemaining] };
  const startMs = opts.now();
  let pagesThisTick = 0;

  while (state.currentBucket !== null) {
    if (pagesThisTick >= opts.maxPages) break;
    if (opts.now() - startMs >= opts.maxMs) break;
    if (state.objectsIndexed >= opts.hardCap) {
      return { done: true, partialLimitHit: true, state };
    }

    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: state.currentBucket,
        ContinuationToken: state.nextContinuationToken ?? undefined,
      })
    );
    pagesThisTick += 1;

    const contents = page.Contents ?? [];
    if (contents.length > 0) {
      const items: IndexUpsertInput[] = contents
        .filter((c): c is typeof c & { Key: string } => !!c.Key)
        .map((c) => ({
          workspaceId: state.workspaceId,
          connectionId: state.connectionId,
          bucket: state.currentBucket as string,
          key: c.Key as string,
          size: BigInt(c.Size ?? 0),
          lastModified: c.LastModified ?? new Date(0),
          etag: c.ETag ?? null,
        }));

      // Trim if we'd cross the cap.
      const allowed = opts.hardCap - state.objectsIndexed;
      const sliced = items.slice(0, Math.max(0, allowed));
      if (sliced.length > 0) {
        await indexBulkUpsert(sliced);
        state.objectsIndexed += sliced.length;
      }
      if (state.objectsIndexed >= opts.hardCap) {
        return { done: true, partialLimitHit: true, state };
      }
    }

    if (page.IsTruncated) {
      state.nextContinuationToken = page.NextContinuationToken ?? null;
    } else {
      state.currentBucket = state.bucketsRemaining.shift() ?? null;
      state.nextContinuationToken = null;
    }
  }

  return { done: state.currentBucket === null, partialLimitHit: false, state };
}
