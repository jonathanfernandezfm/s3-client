import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import {
  getConnectionsByUserId,
  createConnection,
  ensurePersonalWorkspace,
  getWorkspaceAccess,
  getConnectionAccessById,
  type ConnectionInput,
} from "@/lib/db/connections";
import { canCreateConnection } from "@/lib/subscriptions";
import { runConnectionHealthCheck } from "@/lib/health/runner";
import prisma from "@/lib/db/prisma";
import { isSearchIndexEnabled } from "@/lib/search/feature-flag";

// GET /api/connections - List user's connections
export const GET = withAuth(async (req, { user }) => {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId") || undefined;
  const connections = await getConnectionsByUserId(user.id, workspaceId);

  // Don't expose secret keys in the list response
  const accessEntries = await Promise.all(
    connections.map((conn) => getConnectionAccessById(conn.id, user.id))
  );

  const safeConnections = accessEntries
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => ({
      id: entry.connection.id,
      name: entry.connection.name,
      endpoint: entry.connection.endpoint,
      region: entry.connection.region,
      accessKeyId: entry.connection.accessKeyId,
      forcePathStyle: entry.connection.forcePathStyle,
      workspaceId: entry.workspaceId,
      workspaceType: entry.workspaceType,
      role: entry.role,
      createdAt: entry.connection.createdAt,
      updatedAt: entry.connection.updatedAt,
    }));

  return NextResponse.json(safeConnections);
});

// POST /api/connections - Create a new connection
export const POST = withAuth(async (req, { user }) => {
  const body: ConnectionInput & { workspaceId?: string } = await req.json();

  let targetWorkspaceId: string;
  let targetWorkspaceType: "PERSONAL" | "TEAM";
  if (body.workspaceId) {
    const access = await getWorkspaceAccess(body.workspaceId, user.id);
    if (!access || access.role !== "ADMIN") {
      return NextResponse.json(
        { error: "You do not have permission to create connections in this workspace" },
        { status: 403 }
      );
    }
    targetWorkspaceId = access.workspace.id;
    targetWorkspaceType = access.workspace.type;
  } else {
    const personalWorkspace = await ensurePersonalWorkspace(user.id);
    targetWorkspaceId = personalWorkspace.id;
    targetWorkspaceType = personalWorkspace.type;
  }

  // Check tier limits
  const tier = user.subscription?.tier ?? "FREE";
  const limitCheck = await canCreateConnection(targetWorkspaceId, tier);

  if (!limitCheck.allowed) {
    return NextResponse.json({ error: limitCheck.reason }, { status: 403 });
  }

  if (!body.endpoint || !body.accessKeyId || !body.secretAccessKey) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: endpoint, accessKeyId, secretAccessKey",
      },
      { status: 400 }
    );
  }

  let connection;
  try {
    connection = await createConnection(
      user.id,
      {
        name: body.name,
        endpoint: body.endpoint,
        region: body.region || "us-east-1",
        accessKeyId: body.accessKeyId,
        secretAccessKey: body.secretAccessKey,
        forcePathStyle: body.forcePathStyle ?? true,
      },
      targetWorkspaceId
    );
  } catch {
    return NextResponse.json(
      { error: "You do not have permission to create this connection" },
      { status: 403 }
    );
  }

  // Non-blocking onboarding diagnostic — kick off the connection-level
  // health check so the report is ready when the user lands on the page.
  runConnectionHealthCheck(connection.id).catch((err) => {
    console.error(
      `[health] initial connection check failed for ${connection.id}:`,
      err,
    );
  });

  // Enqueue initial crawl for PRO+ users if search indexing is enabled
  if (isSearchIndexEnabled()) {
    const searchTier = user.subscription?.tier ?? "FREE";
    if (searchTier !== "FREE") {
      try {
        const job = await prisma.crawlJob.create({
          data: {
            connectionId: connection.id,
            kind: "INITIAL",
            status: "PENDING",
            bucketsRemaining: [],
          },
        });
        const token = process.env.INTERNAL_API_TOKEN;
        const baseUrl = req.nextUrl.origin;
        if (token) {
          fetch(`${baseUrl}/api/internal/crawl?jobId=${job.id}`, {
            method: "POST",
            headers: { "x-internal-token": token },
          }).catch((err) => {
            console.error(`[search-index] initial crawl fire failed for ${connection.id}:`, err);
          });
        }
      } catch (err) {
        console.error(`[search-index] failed to enqueue initial crawl for ${connection.id}:`, err);
      }
    }
  }

  return NextResponse.json({
    id: connection.id,
    name: connection.name,
    endpoint: connection.endpoint,
    region: connection.region,
    accessKeyId: connection.accessKeyId,
    forcePathStyle: connection.forcePathStyle,
    workspaceId: connection.workspaceId,
    workspaceType: targetWorkspaceType,
    role: "ADMIN",
    createdAt: connection.createdAt,
  });
});
