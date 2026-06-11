export interface FileWithPath {
  file: File;
  relativePath: string;
}

// Minimal structural types for the non-standard FileSystem Entry API
// (DataTransferItem.webkitGetAsEntry), so tests can use plain objects.
export interface FileEntryLike {
  isFile: true;
  isDirectory: false;
  name: string;
  file: (cb: (file: File) => void, errCb?: (err: unknown) => void) => void;
}

export interface DirectoryEntryLike {
  isFile: false;
  isDirectory: true;
  name: string;
  createReader: () => DirectoryReaderLike;
}

export interface DirectoryReaderLike {
  readEntries: (
    cb: (entries: EntryLike[]) => void,
    errCb?: (err: unknown) => void
  ) => void;
}

export type EntryLike = FileEntryLike | DirectoryEntryLike;

export async function walkEntry(
  entry: EntryLike,
  prefix = ""
): Promise<FileWithPath[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      entry.file(resolve, reject)
    );
    return [{ file, relativePath: prefix + entry.name }];
  }

  const reader = entry.createReader();
  const children: EntryLike[] = [];
  // readEntries returns results in batches (Chrome caps at 100 per call) —
  // keep reading until it returns an empty array.
  for (;;) {
    const batch = await new Promise<EntryLike[]>((resolve, reject) =>
      reader.readEntries(resolve, reject)
    );
    if (batch.length === 0) break;
    children.push(...batch);
  }

  const results: FileWithPath[] = [];
  for (const child of children) {
    results.push(...(await walkEntry(child, prefix + entry.name + "/")));
  }
  return results;
}

/**
 * Extracts files (with folder-relative paths) from a drop event's DataTransfer.
 * Entry handles must be captured synchronously — they are only valid during
 * the drop event — which this function does before any await.
 */
export async function filesFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<FileWithPath[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .filter((item) => item.kind === "file")
    .map((item) =>
      typeof item.webkitGetAsEntry === "function"
        ? (item.webkitGetAsEntry() as unknown as EntryLike | null)
        : null
    );

  if (entries.length === 0 || entries.every((e) => e === null)) {
    // Fallback for browsers without the entries API: flat file list.
    return Array.from(dataTransfer.files ?? []).map((file) => ({
      file,
      relativePath: file.name,
    }));
  }

  const results: FileWithPath[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    results.push(...(await walkEntry(entry)));
  }
  return results;
}
