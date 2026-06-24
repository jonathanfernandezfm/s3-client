import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { authenticateFromEnv } from "./auth";
import * as tools from "./tools";

async function main() {
  const user = await authenticateFromEnv();

  const server = new McpServer({ name: "s3dock", version: "0.1.0" });

  // -------------------------------------------------------------------------
  // list_connections — no args required
  // -------------------------------------------------------------------------
  server.tool(
    "list_connections",
    "List all S3 connections this user can access (name, endpoint, region, role).",
    {},
    async () => {
      const result = await tools.listConnections(user);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // list_buckets
  // -------------------------------------------------------------------------
  server.tool(
    "list_buckets",
    "List all buckets for a given S3 connection.",
    {
      connectionId: z.string().describe("The S3 connection ID"),
    },
    async ({ connectionId }) => {
      const result = await tools.listBuckets(user, { connectionId });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // list_objects
  // -------------------------------------------------------------------------
  server.tool(
    "list_objects",
    "List objects and folders in a bucket (optionally scoped to a prefix). Supports pagination via continuationToken.",
    {
      connectionId: z.string().describe("The S3 connection ID"),
      bucket: z.string().describe("Bucket name"),
      prefix: z
        .string()
        .optional()
        .describe('Key prefix to scope the listing (e.g. "logs/"). Omit or pass "" for root.'),
      continuationToken: z
        .string()
        .optional()
        .describe("Pagination token from a previous list_objects response"),
    },
    async ({ connectionId, bucket, prefix, continuationToken }) => {
      const result = await tools.listObjects(user, {
        connectionId,
        bucket,
        prefix,
        continuationToken,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // head_object
  // -------------------------------------------------------------------------
  server.tool(
    "head_object",
    "Get metadata for a specific S3 object (content type, size, ETag, last modified, storage class, user metadata).",
    {
      connectionId: z.string().describe("The S3 connection ID"),
      bucket: z.string().describe("Bucket name"),
      key: z.string().describe("Object key"),
    },
    async ({ connectionId, bucket, key }) => {
      const result = await tools.headObject(user, { connectionId, bucket, key });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // presign_download
  // -------------------------------------------------------------------------
  server.tool(
    "presign_download",
    "Generate a pre-signed download URL for an S3 object. The URL is valid for expiresIn seconds (60–3600, default 900).",
    {
      connectionId: z.string().describe("The S3 connection ID"),
      bucket: z.string().describe("Bucket name"),
      key: z.string().describe("Object key"),
      expiresIn: z
        .number()
        .int()
        .optional()
        .describe("URL expiry in seconds (60–3600). Defaults to 900."),
    },
    async ({ connectionId, bucket, key, expiresIn }) => {
      const result = await tools.presignDownload(user, {
        connectionId,
        bucket,
        key,
        expiresIn,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  // stdout is the MCP protocol channel — diagnostics go to stderr only.
  console.error(`[s3dock-mcp] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
