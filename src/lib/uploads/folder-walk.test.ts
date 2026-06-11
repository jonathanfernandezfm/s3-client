import { describe, it, expect } from "vitest";
import {
  walkEntry,
  type EntryLike,
  type FileEntryLike,
  type DirectoryEntryLike,
} from "./folder-walk";

function fileEntry(name: string): FileEntryLike {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (cb) => cb(new File([new Uint8Array(1)], name)),
  };
}

function dirEntry(
  name: string,
  children: EntryLike[],
  batchSize = 100
): DirectoryEntryLike {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let offset = 0;
      return {
        readEntries: (cb) => {
          const batch = children.slice(offset, offset + batchSize);
          offset += batch.length;
          cb(batch);
        },
      };
    },
  };
}

describe("walkEntry", () => {
  it("returns a single file with its name as the relative path", async () => {
    const result = await walkEntry(fileEntry("a.txt"));
    expect(result).toHaveLength(1);
    expect(result[0].relativePath).toBe("a.txt");
    expect(result[0].file.name).toBe("a.txt");
  });

  it("walks nested directories, prefixing paths with folder names", async () => {
    const tree = dirEntry("root", [
      fileEntry("a.txt"),
      dirEntry("sub", [fileEntry("b.txt"), dirEntry("deep", [fileEntry("c.txt")])]),
    ]);
    const result = await walkEntry(tree);
    expect(result.map((r) => r.relativePath).sort()).toEqual([
      "root/a.txt",
      "root/sub/b.txt",
      "root/sub/deep/c.txt",
    ].sort());
  });

  it("reads directories larger than one readEntries batch", async () => {
    const children = Array.from({ length: 250 }, (_, i) =>
      fileEntry(`f${i}.txt`)
    );
    const tree = dirEntry("big", children, 100); // batches of 100: 100+100+50
    const result = await walkEntry(tree);
    expect(result).toHaveLength(250);
  });

  it("returns an empty list for an empty directory", async () => {
    const result = await walkEntry(dirEntry("empty", []));
    expect(result).toEqual([]);
  });
});
