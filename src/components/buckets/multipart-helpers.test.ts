import { describe, test, expect } from "vitest";
import {
  sortUploadsByInitiated,
  formatRelativeAge,
  formatInitiator,
} from "./multipart-helpers";
import type { IncompleteUpload } from "@/types/s3";

function upload(overrides: Partial<IncompleteUpload> = {}): IncompleteUpload {
  return {
    key: "file.bin",
    uploadId: "upload-1",
    initiated: "2026-06-01T00:00:00.000Z",
    storageClass: "STANDARD",
    initiatorDisplayName: null,
    initiatorId: null,
    ...overrides,
  };
}

describe("sortUploadsByInitiated", () => {
  test("sorts oldest first", () => {
    const items = [
      upload({ uploadId: "new", initiated: "2026-06-05T00:00:00.000Z" }),
      upload({ uploadId: "old", initiated: "2026-01-01T00:00:00.000Z" }),
      upload({ uploadId: "mid", initiated: "2026-03-01T00:00:00.000Z" }),
    ];
    const sorted = sortUploadsByInitiated(items);
    expect(sorted.map((u) => u.uploadId)).toEqual(["old", "mid", "new"]);
  });

  test("does not mutate input", () => {
    const items = [
      upload({ uploadId: "a", initiated: "2026-06-05T00:00:00.000Z" }),
      upload({ uploadId: "b", initiated: "2026-01-01T00:00:00.000Z" }),
    ];
    const copy = [...items];
    sortUploadsByInitiated(items);
    expect(items).toEqual(copy);
  });
});

describe("formatRelativeAge", () => {
  const now = new Date("2026-06-05T12:00:00.000Z");

  test("returns 'just now' for under a minute", () => {
    expect(formatRelativeAge("2026-06-05T11:59:30.000Z", now)).toBe("just now");
  });

  test("returns minutes for under an hour", () => {
    expect(formatRelativeAge("2026-06-05T11:30:00.000Z", now)).toBe("30 minutes ago");
  });

  test("returns hours for under a day", () => {
    expect(formatRelativeAge("2026-06-05T06:00:00.000Z", now)).toBe("6 hours ago");
  });

  test("returns days for under a month", () => {
    expect(formatRelativeAge("2026-06-01T12:00:00.000Z", now)).toBe("4 days ago");
  });

  test("returns months for under a year", () => {
    expect(formatRelativeAge("2026-03-05T12:00:00.000Z", now)).toBe("3 months ago");
  });

  test("returns years otherwise", () => {
    expect(formatRelativeAge("2024-06-05T12:00:00.000Z", now)).toBe("2 years ago");
  });

  test("singularizes units of 1", () => {
    expect(formatRelativeAge("2026-06-05T11:00:00.000Z", now)).toBe("1 hour ago");
    expect(formatRelativeAge("2026-06-04T12:00:00.000Z", now)).toBe("1 day ago");
  });
});

describe("formatInitiator", () => {
  test("prefers display name when present", () => {
    expect(formatInitiator(upload({ initiatorDisplayName: "alice", initiatorId: "id-1" }))).toBe("alice");
  });

  test("falls back to id when display name missing", () => {
    expect(formatInitiator(upload({ initiatorDisplayName: null, initiatorId: "id-1" }))).toBe("id-1");
  });

  test("returns 'Unknown' when both are missing", () => {
    expect(formatInitiator(upload({ initiatorDisplayName: null, initiatorId: null }))).toBe("Unknown");
  });
});
