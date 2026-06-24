# S3Dock MCP Server

S3Dock ships a built-in [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that exposes your S3 connections to AI assistants (Claude Desktop, Cursor, etc.).

This is a **read-only MVP** — it lets an assistant list connections, list buckets, browse objects, inspect object metadata, and generate pre-signed download URLs. Mutating operations (upload, delete, copy, move) are explicitly not exposed.

## Prerequisites

- Node.js 18+
- A running S3Dock database (same `DATABASE_URL` as the web app)
- The same `ENCRYPTION_KEY` used by the web app (needed to decrypt stored S3 credentials)
- A personal access token (see below)

## Mint a token

Use the included script to issue a personal access token for a registered user:

```bash
node scripts/issue-mcp-token.js <user-email> <token-name>
```

Example:

```bash
node scripts/issue-mcp-token.js alice@example.com "claude-desktop"
```

The raw token is shown **once** — store it immediately. It looks like:

```
s3dock_pat_<random>
```

## Required environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (same as web app) |
| `ENCRYPTION_KEY` | 64-hex-char key used to decrypt stored S3 credentials |
| `S3DOCK_MCP_TOKEN` | Personal access token issued above |

## Run the server

```bash
S3DOCK_MCP_TOKEN=s3dock_pat_... pnpm mcp
```

The server communicates over **stdio** (standard input/output). It is a single-user process — each process resolves one token to one user at startup.

## Claude Desktop configuration

Add this block to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "s3dock": {
      "command": "pnpm",
      "args": ["mcp"],
      "cwd": "/absolute/path/to/s3dock",
      "env": {
        "DATABASE_URL": "postgres://user:pass@host:5432/dbname",
        "ENCRYPTION_KEY": "<64-hex-char key>",
        "S3DOCK_MCP_TOKEN": "s3dock_pat_..."
      }
    }
  }
}
```

Replace `/absolute/path/to/s3dock` with the absolute path to your S3Dock checkout.

On macOS, the config file is at:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

## Available tools

| Tool | Description |
|---|---|
| `list_connections` | List all S3 connections you can access |
| `list_buckets` | List buckets for a given connection |
| `list_objects` | List objects and folders in a bucket (supports prefix and pagination) |
| `head_object` | Get metadata for a specific object (content-type, size, ETag, etc.) |
| `presign_download` | Generate a pre-signed download URL (valid 60–3600 s, default 900 s) |

## Quota / metering

Each S3 API call (`list_buckets`, `list_objects`, `head_object`, `presign_download`) counts against your monthly operation quota — the same quota as the web app. Heavy assistant use will draw down your tier limit.

## Security notes

- Credentials are **never** returned by any tool — only connection names, IDs, and endpoints are surfaced.
- Authorization mirrors the web app: the token user must have at least VIEWER access on a connection to use it.
- The server writes **nothing to stdout** except the MCP protocol wire format. All diagnostics go to stderr.
