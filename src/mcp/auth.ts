import { resolveMcpToken } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";

/**
 * Resolve the MCP user from the S3DOCK_MCP_TOKEN environment variable.
 * Called once at server startup — this process serves a single user.
 * Throws (and causes process.exit(1)) if the token is missing or invalid.
 */
export async function authenticateFromEnv(): Promise<AuthUser> {
  const raw = process.env.S3DOCK_MCP_TOKEN;
  if (!raw) {
    throw new Error(
      "S3DOCK_MCP_TOKEN is not set. Mint one with: node scripts/issue-mcp-token.js <email> <name>"
    );
  }
  const user = await resolveMcpToken(raw);
  if (!user) {
    throw new Error("S3DOCK_MCP_TOKEN is invalid, revoked, or expired.");
  }
  return user;
}
