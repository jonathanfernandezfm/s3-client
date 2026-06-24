import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Authenticated fetch helper
// All S3Dock API calls go through here. Throws on non-2xx.
// stdout is the MCP protocol channel — never write to it outside the SDK.
// The optional `config` parameter allows dependency injection in tests without
// triggering module-level env validation.
// ---------------------------------------------------------------------------

export async function sdFetch(
  path: string,
  init: RequestInit = {},
  config?: { baseUrl: string; token: string }
): Promise<unknown> {
  const baseUrl = config?.baseUrl ?? process.env.S3DOCK_URL?.replace(/\/$/, "") ?? "";
  const token = config?.token ?? process.env.S3DOCK_MCP_TOKEN ?? "";

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`S3Dock API error ${res.status}: ${body}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Startup auth check — verifies the token works before accepting tool calls
// ---------------------------------------------------------------------------

async function verifyToken(): Promise<void> {
  try {
    await sdFetch("/api/connections");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 401/403 → token bad; other errors → network/url wrong
    throw new Error(`Startup auth check failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

async function main() {
  // Config — validated at startup
  const BASE_URL = process.env.S3DOCK_URL?.replace(/\/$/, "");
  const TOKEN = process.env.S3DOCK_MCP_TOKEN;

  if (!BASE_URL || !TOKEN) {
    console.error("[s3dock-mcp] S3DOCK_URL and S3DOCK_MCP_TOKEN must be set.");
    process.exit(1);
  }

  await verifyToken(); // exits via catch below if bad

  const server = new McpServer({ name: "s3dock", version: "0.2.0" });

  server.tool(
    "list_connections",
    "List the S3 connections this user can access (id, name, endpoint, region, role).",
    {},
    async () => {
      const data = await sdFetch("/api/connections");
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "list_buckets",
    "List all buckets for a given S3 connection.",
    { connectionId: z.string().describe("The S3 connection ID") },
    async ({ connectionId }) => {
      const data = await sdFetch("/api/buckets", {
        method: "POST",
        body: JSON.stringify({ connectionId }),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "list_objects",
    "List objects and folders under a prefix in a bucket. Supports pagination.",
    {
      connectionId: z.string().describe("The S3 connection ID"),
      bucket: z.string().describe("Bucket name"),
      prefix: z.string().optional().describe('Key prefix (e.g. "logs/"). Omit for root.'),
      continuationToken: z.string().optional().describe("Pagination token from a previous response"),
    },
    async (args) => {
      const data = await sdFetch("/api/objects", {
        method: "POST",
        body: JSON.stringify(args),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "head_object",
    "Get metadata for an S3 object (content type, size, ETag, last modified, storage class, user metadata).",
    {
      connectionId: z.string().describe("The S3 connection ID"),
      bucket: z.string().describe("Bucket name"),
      key: z.string().describe("Object key"),
    },
    async (args) => {
      const data = await sdFetch("/api/objects/head", {
        method: "POST",
        body: JSON.stringify(args),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "presign_download",
    "Generate a pre-signed download URL for an S3 object (valid for 1 hour).",
    {
      connectionId: z.string().describe("The S3 connection ID"),
      bucket: z.string().describe("Bucket name"),
      key: z.string().describe("Object key"),
    },
    async (args) => {
      const data = await sdFetch("/api/objects/download", {
        method: "POST",
        body: JSON.stringify(args),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  await server.connect(new StdioServerTransport());
}

// Only run when executed as a script (tsx src/mcp/server.ts), not when
// imported by vitest. tsx resolves process.argv[1] to the script's file URL
// or absolute path; import.meta.url ends with the same path.
const scriptPath = process.argv[1]?.replace(/\\/g, "/") ?? "";
const thisPath = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
if (scriptPath && (thisPath.endsWith(scriptPath) || scriptPath.endsWith("server.ts"))) {
  main().catch((err) => {
    // stdout belongs to the MCP protocol — always use stderr for diagnostics.
    console.error(`[s3dock-mcp] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
