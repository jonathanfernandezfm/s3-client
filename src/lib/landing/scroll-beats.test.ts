import { describe, expect, it } from "vitest";
import { getBeat } from "./scroll-beats";

describe("getBeat", () => {
  it("returns the first beat at progress 0", () => {
    expect(getBeat(0, 3)).toEqual({ index: 0, local: 0 });
  });

  it("maps mid-progress to the middle beat with local progress", () => {
    expect(getBeat(0.5, 3)).toEqual({ index: 1, local: 0.5 });
  });

  it("returns the last beat fully played at progress 1", () => {
    expect(getBeat(1, 3)).toEqual({ index: 2, local: 1 });
  });

  it("clamps out-of-range progress", () => {
    expect(getBeat(-0.5, 3)).toEqual({ index: 0, local: 0 });
    expect(getBeat(1.5, 3)).toEqual({ index: 2, local: 1 });
  });

  it("throws when beatCount is not positive", () => {
    expect(() => getBeat(0.5, 0)).toThrow();
  });
});
