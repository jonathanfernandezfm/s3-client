import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";
import { zipEntryName } from "./zip-naming";

export const MAX_ZIP_ENTRIES = 5000;

export interface ZipEntry {
  key: string;
  name: string;
}

export class ZipTooLargeError extends Error {
  constructor(max: number) {
    super(`Selection exceeds the ${max}-file zip limit`);
    this.name = "ZipTooLargeError";
  }
}

export async function collectZipEntries(
  client: S3Client,
  bucket: string,
  keys: string[],
  rootPrefix: string,
  maxEntries: number = MAX_ZIP_ENTRIES
): Promise<ZipEntry[]> {
  const seen = new Set<string>();
  const fileKeys: string[] = [];

  const addKey = (key: string) => {
    if (key.endsWith("/")) return;
    if (seen.has(key)) return;
    seen.add(key);
    fileKeys.push(key);
    if (fileKeys.length > maxEntries) throw new ZipTooLargeError(maxEntries);
  };

  for (const key of keys) {
    if (!key.endsWith("/")) {
      addKey(key);
      continue;
    }

    let continuationToken: string | undefined;
    do {
      const page = (await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: key,
          ContinuationToken: continuationToken,
        })
      )) as ListObjectsV2CommandOutput;

      for (const obj of page.Contents ?? []) {
        if (obj.Key) addKey(obj.Key);
      }
      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }

  return fileKeys.map((key) => ({ key, name: zipEntryName(key, rootPrefix) }));
}
