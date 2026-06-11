export const MIB = 1024 * 1024;

/** S3 allows at most 10,000 parts per multipart upload. */
export const MAX_PARTS = 10_000;

/** Part size used unless the file is too large to fit in MAX_PARTS parts. */
export const DEFAULT_PART_SIZE = 8 * MIB;

/** Files at or below this size are uploaded with a single presigned PUT. */
export const SINGLE_PUT_THRESHOLD = 8 * MIB;

export function computePartSize(fileSize: number): number {
  if (fileSize <= MAX_PARTS * DEFAULT_PART_SIZE) return DEFAULT_PART_SIZE;
  // Scale up so the file fits in MAX_PARTS parts, rounded up to a whole MiB.
  return Math.ceil(fileSize / MAX_PARTS / MIB) * MIB;
}

export function computePartCount(fileSize: number, partSize: number): number {
  if (fileSize === 0) return 1;
  return Math.ceil(fileSize / partSize);
}

export function isSinglePutEligible(fileSize: number): boolean {
  return fileSize <= SINGLE_PUT_THRESHOLD;
}
