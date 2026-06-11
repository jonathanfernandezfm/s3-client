import { describe, it, expect } from "vitest";
import { validatePartNumbers, MAX_SIGN_BATCH } from "./validate";

describe("validatePartNumbers", () => {
  it("accepts a valid list of part numbers", () => {
    expect(validatePartNumbers([1, 2, 3])).toEqual([1, 2, 3]);
    expect(validatePartNumbers([10000])).toEqual([10000]);
  });

  it("rejects non-arrays and empty arrays", () => {
    expect(validatePartNumbers(undefined)).toBeNull();
    expect(validatePartNumbers("1,2")).toBeNull();
    expect(validatePartNumbers([])).toBeNull();
  });

  it("rejects batches larger than MAX_SIGN_BATCH", () => {
    const tooMany = Array.from({ length: MAX_SIGN_BATCH + 1 }, (_, i) => i + 1);
    expect(validatePartNumbers(tooMany)).toBeNull();
  });

  it("rejects out-of-range or non-integer values", () => {
    expect(validatePartNumbers([0])).toBeNull();
    expect(validatePartNumbers([10001])).toBeNull();
    expect(validatePartNumbers([1.5])).toBeNull();
    expect(validatePartNumbers(["2"])).toBeNull();
    expect(validatePartNumbers([1, -3])).toBeNull();
  });

  it("rejects duplicate part numbers", () => {
    expect(validatePartNumbers([1, 1, 1])).toBeNull();
    expect(validatePartNumbers([1, 2, 2])).toBeNull();
  });
});
