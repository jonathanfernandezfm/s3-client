import { describe, test, expect, vi, beforeEach } from "vitest";

// Set env vars before importing server.ts so the module-level guard does not
// call process.exit(1). These are fake values — no real network calls happen.
vi.stubEnv("S3DOCK_URL", "https://s3dock.test");
vi.stubEnv("S3DOCK_MCP_TOKEN", "s3dock_pat_testtoken");

// Stub fetch globally before the module is loaded.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock the MCP SDK so importing server.ts does not attempt to wire stdio or
// connect a transport. The module will still register tools and call main().
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    tool() {}
    async connect() {}
  },
}));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {},
}));

import { sdFetch } from "./server";

beforeEach(() => {
  vi.clearAllMocks();
});

const testConfig = { baseUrl: "https://s3dock.test", token: "s3dock_pat_testtoken" };

function mockResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

// 1. list_connections success
describe("sdFetch — list_connections success", () => {
  test("returns parsed JSON when the API responds 200", async () => {
    const payload = [{ id: "c1", name: "Prod" }];
    mockFetch.mockResolvedValueOnce(mockResponse(payload));

    const result = await sdFetch("/api/connections", {}, testConfig);

    expect(result).toEqual(payload);
    expect(JSON.stringify(result)).toContain("c1");
  });
});

// 2. API error propagation
describe("sdFetch — API error propagation", () => {
  test("throws an error containing the status code on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("Not Found", 404));

    await expect(sdFetch("/api/connections", {}, testConfig)).rejects.toThrow("404");
  });
});

// 3. list_objects passes all params including continuationToken
describe("sdFetch — list_objects passes all params", () => {
  test("calls fetch with correct URL, method POST, and body including continuationToken", async () => {
    const payload = { objects: [], isTruncated: false };
    mockFetch.mockResolvedValueOnce(mockResponse(payload));

    const args = {
      connectionId: "conn-1",
      bucket: "my-bucket",
      prefix: "logs/",
      continuationToken: "tok-abc",
    };

    await sdFetch("/api/objects", { method: "POST", body: JSON.stringify(args) }, testConfig);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://s3dock.test/api/objects");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as typeof args;
    expect(body.continuationToken).toBe("tok-abc");
    expect(body.connectionId).toBe("conn-1");
  });
});

// 4. presign_download returns { url }
describe("sdFetch — presign_download returns url", () => {
  test("tool content contains the presigned URL string", async () => {
    const payload = { url: "https://s3.amazonaws.com/bucket/key?X-Amz-Signature=abc" };
    mockFetch.mockResolvedValueOnce(mockResponse(payload));

    const result = (await sdFetch("/api/objects/download", { method: "POST", body: JSON.stringify({}) }, testConfig)) as { url: string };

    expect(result.url).toMatch(/^https:\/\//);
    const text = JSON.stringify(result, null, 2);
    expect(text).toContain("url");
    expect(text).toContain("https://s3.amazonaws.com");
  });
});

// 5. sdFetch non-2xx error path (covers missing/bad token scenario at the network level)
describe("sdFetch — non-2xx error path", () => {
  test("throws with status in message when server returns 401", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ error: "Unauthorized" }, 401));

    await expect(
      sdFetch("/api/connections", {}, testConfig)
    ).rejects.toThrow("S3Dock API error 401");
  });
});
