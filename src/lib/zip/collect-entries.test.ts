import { describe, it, expect, vi } from "vitest";
import type { S3Client } from "@aws-sdk/client-s3";
import { collectZipEntries, ZipTooLargeError } from "./collect-entries";

function fakeClient(pages: Array<Record<string, unknown>>) {
  const send = vi.fn();
  for (const page of pages) send.mockResolvedValueOnce(page);
  return { client: { send } as unknown as S3Client, send };
}

describe("collectZipEntries", () => {
  it("passes plain file keys through without listing", async () => {
    const { client, send } = fakeClient([]);
    const entries = await collectZipEntries(
      client,
      "bucket",
      ["photos/a.jpg", "photos/b.jpg"],
      "photos/"
    );
    expect(send).not.toHaveBeenCalled();
    expect(entries).toEqual([
      { key: "photos/a.jpg", name: "a.jpg" },
      { key: "photos/b.jpg", name: "b.jpg" },
    ]);
  });

  it("expands folder keys recursively, following pagination", async () => {
    const { client, send } = fakeClient([
      {
        Contents: [{ Key: "photos/2024/a.jpg" }],
        IsTruncated: true,
        NextContinuationToken: "token-1",
      },
      {
        Contents: [{ Key: "photos/2024/deep/b.jpg" }],
        IsTruncated: false,
      },
    ]);
    const entries = await collectZipEntries(
      client,
      "bucket",
      ["photos/2024/"],
      "photos/"
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].input).toMatchObject({
      Bucket: "bucket",
      Prefix: "photos/2024/",
      ContinuationToken: "token-1",
    });
    expect(entries).toEqual([
      { key: "photos/2024/a.jpg", name: "2024/a.jpg" },
      { key: "photos/2024/deep/b.jpg", name: "2024/deep/b.jpg" },
    ]);
  });

  it("skips zero-byte folder marker objects", async () => {
    const { client } = fakeClient([
      {
        Contents: [{ Key: "docs/" }, { Key: "docs/sub/" }, { Key: "docs/a.txt" }],
        IsTruncated: false,
      },
    ]);
    const entries = await collectZipEntries(client, "bucket", ["docs/"], "");
    expect(entries).toEqual([{ key: "docs/a.txt", name: "docs/a.txt" }]);
  });

  it("dedupes a file selected alongside its parent folder", async () => {
    const { client } = fakeClient([
      { Contents: [{ Key: "docs/a.txt" }], IsTruncated: false },
    ]);
    const entries = await collectZipEntries(
      client,
      "bucket",
      ["docs/a.txt", "docs/"],
      ""
    );
    expect(entries).toEqual([{ key: "docs/a.txt", name: "docs/a.txt" }]);
  });

  it("throws ZipTooLargeError beyond the entry cap", async () => {
    const { client } = fakeClient([
      {
        Contents: [{ Key: "d/1" }, { Key: "d/2" }, { Key: "d/3" }],
        IsTruncated: false,
      },
    ]);
    await expect(
      collectZipEntries(client, "bucket", ["d/"], "", 2)
    ).rejects.toBeInstanceOf(ZipTooLargeError);
  });
});
