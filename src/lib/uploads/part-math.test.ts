import { describe, it, expect } from "vitest";
import {
  MIB,
  DEFAULT_PART_SIZE,
  SINGLE_PUT_THRESHOLD,
  MAX_PARTS,
  computePartSize,
  computePartCount,
  isSinglePutEligible,
} from "./part-math";

describe("computePartSize", () => {
  it("returns the default part size for typical files", () => {
    expect(computePartSize(0)).toBe(DEFAULT_PART_SIZE);
    expect(computePartSize(100 * MIB)).toBe(DEFAULT_PART_SIZE);
    expect(computePartSize(MAX_PARTS * DEFAULT_PART_SIZE)).toBe(DEFAULT_PART_SIZE);
  });

  it("scales up for files that would exceed the 10,000 part limit", () => {
    const fileSize = 100 * 1024 * MIB; // 100 GiB
    const partSize = computePartSize(fileSize);
    expect(partSize).toBeGreaterThan(DEFAULT_PART_SIZE);
    expect(partSize % MIB).toBe(0); // whole MiB
    expect(computePartCount(fileSize, partSize)).toBeLessThanOrEqual(MAX_PARTS);
  });
});

describe("computePartCount", () => {
  it("returns 1 for an empty file", () => {
    expect(computePartCount(0, DEFAULT_PART_SIZE)).toBe(1);
  });

  it("rounds up partial parts", () => {
    expect(computePartCount(8 * MIB, 8 * MIB)).toBe(1);
    expect(computePartCount(8 * MIB + 1, 8 * MIB)).toBe(2);
    expect(computePartCount(24 * MIB, 8 * MIB)).toBe(3);
  });
});

describe("isSinglePutEligible", () => {
  it("uses a single PUT up to and including the threshold", () => {
    expect(isSinglePutEligible(0)).toBe(true);
    expect(isSinglePutEligible(SINGLE_PUT_THRESHOLD)).toBe(true);
    expect(isSinglePutEligible(SINGLE_PUT_THRESHOLD + 1)).toBe(false);
  });
});
