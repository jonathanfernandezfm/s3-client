import { MAX_PARTS } from "./part-math";

/** Maximum number of part URLs signed per request. */
export const MAX_SIGN_BATCH = 100;

/**
 * Returns the validated part numbers, or null if the input is not a
 * non-empty array of unique integers in [1, MAX_PARTS] within the batch cap.
 */
export function validatePartNumbers(input: unknown): number[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_SIGN_BATCH) {
    return null;
  }
  const out: number[] = [];
  for (const n of input) {
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_PARTS) {
      return null;
    }
    out.push(n);
  }
  if (new Set(out).size !== out.length) return null;
  return out;
}
