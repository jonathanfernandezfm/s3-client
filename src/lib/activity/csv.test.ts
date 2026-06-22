import { describe, test, expect } from "vitest";
import { escapeCsvField, toActivityCsv } from "./csv";
import type { ActivityCsvRow } from "./csv";

describe("escapeCsvField", () => {
  test("plain value is returned unchanged", () => {
    expect(escapeCsvField("hello")).toBe("hello");
  });

  test("value with a comma gets wrapped in quotes", () => {
    expect(escapeCsvField("hello,world")).toBe('"hello,world"');
  });

  test('value with a double-quote has it doubled and gets wrapped in quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  test("value with a newline gets wrapped in quotes", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  test("value with a carriage return gets wrapped in quotes", () => {
    expect(escapeCsvField("line1\rline2")).toBe('"line1\rline2"');
  });

  test("null returns an empty string", () => {
    expect(escapeCsvField(null)).toBe("");
  });

  test("undefined returns an empty string", () => {
    expect(escapeCsvField(undefined)).toBe("");
  });
});

describe("toActivityCsv", () => {
  test("empty rows produces just the header line followed by CRLF", () => {
    const result = toActivityCsv([]);
    expect(result).toBe(
      "createdAt,action,userDisplayName,userId,bucket,key,targetKey,byteSize,batchId\r\n"
    );
  });

  test("one row produces header + one data line with fields in declared order", () => {
    const row: ActivityCsvRow = {
      createdAt: "2024-01-15T10:00:00.000Z",
      action: "UPLOAD",
      userDisplayName: "Alice",
      userId: "user-123",
      bucket: "my-bucket",
      key: "path/to/file.txt",
      targetKey: null,
      byteSize: "1024",
      batchId: null,
    };
    const result = toActivityCsv([row]);
    const lines = result.split("\r\n");
    expect(lines[0]).toBe("createdAt,action,userDisplayName,userId,bucket,key,targetKey,byteSize,batchId");
    expect(lines[1]).toBe("2024-01-15T10:00:00.000Z,UPLOAD,Alice,user-123,my-bucket,path/to/file.txt,,1024,");
    // Two data lines (header + 1 row + trailing empty from split)
    expect(lines.length).toBe(3);
    expect(lines[2]).toBe("");
  });

  test("key containing a comma is correctly quoted", () => {
    const row: ActivityCsvRow = {
      createdAt: "2024-01-15T10:00:00.000Z",
      action: "UPLOAD",
      userDisplayName: "Bob",
      userId: "user-456",
      bucket: "reports-bucket",
      key: "reports/q1,final.pdf",
      targetKey: null,
      byteSize: null,
      batchId: null,
    };
    const result = toActivityCsv([row]);
    const dataLine = result.split("\r\n")[1];
    expect(dataLine).toContain('"reports/q1,final.pdf"');
  });

  test("null fields render as empty cells", () => {
    const row: ActivityCsvRow = {
      createdAt: "2024-01-15T10:00:00.000Z",
      action: "DELETE",
      userDisplayName: "Carol",
      userId: null,
      bucket: "my-bucket",
      key: null,
      targetKey: null,
      byteSize: null,
      batchId: null,
    };
    const result = toActivityCsv([row]);
    const dataLine = result.split("\r\n")[1];
    // userId, key, targetKey, byteSize, batchId are all null → empty cells
    expect(dataLine).toBe("2024-01-15T10:00:00.000Z,DELETE,Carol,,my-bucket,,,,");
  });
});
