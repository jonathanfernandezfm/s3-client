# S3Dock MCP Server

The S3Dock MCP server lets AI assistants (Claude Desktop, etc.) access your
S3 connections through a hosted S3Dock instance. It exposes five read-only
tools: `list_connections`, `list_buckets`, `list_objects`, `head_object`,
and `presign_download`.

## Setup

### 1. Mint a personal access token

On the machine running S3Dock (with `DATABASE_URL` set):

    node scripts/issue-mcp-token.js <your-email> <token-name>

Copy the printed `s3dock_pat_…` token — it is shown once.

### 2. Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or the equivalent path on Windows/Linux:

    {
      "mcpServers": {
        "s3dock": {
          "command": "pnpm",
          "args": ["mcp"],
          "cwd": "/absolute/path/to/this/repo",
          "env": {
            "S3DOCK_URL": "https://your-s3dock.example.com",
            "S3DOCK_MCP_TOKEN": "s3dock_pat_..."
          }
        }
      }
    }

### 3. Verify

In Claude Desktop, try: *"List my S3 connections"*.

## Available tools

| Tool | Description |
|------|-------------|
| `list_connections` | List S3 connections you can access |
| `list_buckets` | List buckets for a connection |
| `list_objects` | List objects/folders under a prefix (paginated) |
| `head_object` | Get metadata for an object |
| `presign_download` | Generate a 1-hour download URL |

## Quota

Each S3 tool call counts as one operation against your S3Dock monthly quota
(same as web app usage). `list_connections` is free (no S3 call).

## Revoke a token

Delete the row from the `mcp_tokens` table:
`DELETE FROM mcp_tokens WHERE prefix = 's3dock_pat_' AND name = '<token-name>';`
A token revoke UI is planned as a follow-up.
