import { describe, test, expect } from "vitest";
import { nextAvailableKey } from "./conflict-name";

describe("nextAvailableKey", () => {
  test("returns key unchanged when not in taken set", () => {
    const taken = new Set(["a/other.png"]);
    expect(nextAvailableKey("a/photo.png", taken)).toBe("a/photo.png");
  });

  test("single collision: appends (1) before the extension", () => {
    const taken = new Set(["a/photo.png"]);
    expect(nextAvailableKey("a/photo.png", taken)).toBe("a/photo (1).png");
  });

  test("multiple collisions: finds first free index", () => {
    const taken = new Set(["a/photo.png", "a/photo (1).png"]);
    expect(nextAvailableKey("a/photo.png", taken)).toBe("a/photo (2).png");
  });

  test("no-extension key: appends (1) after the base name", () => {
    const taken = new Set(["a/README"]);
    expect(nextAvailableKey("a/README", taken)).toBe("a/README (1)");
  });

  test("dotfile (.env): treated as no extension, appends (1) after base", () => {
    const taken = new Set(["a/.env"]);
    expect(nextAvailableKey("a/.env", taken)).toBe("a/.env (1)");
  });

  test("top-level key (no slash): works correctly", () => {
    const taken = new Set(["photo.png"]);
    expect(nextAvailableKey("photo.png", taken)).toBe("photo (1).png");
  });

  test("empty taken set: returns key unchanged", () => {
    expect(nextAvailableKey("a/photo.png", new Set())).toBe("a/photo.png");
  });

  test("skips over n=1 and n=2 when both are taken", () => {
    const taken = new Set(["file.txt", "file (1).txt", "file (2).txt"]);
    expect(nextAvailableKey("file.txt", taken)).toBe("file (3).txt");
  });
});
