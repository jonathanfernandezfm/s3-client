import { NextResponse } from "next/server";
import { ListBucketsCommand } from "@aws-sdk/client-s3";
import { withAuth } from "@/lib/auth";
import {
  createConnection,
  getWorkspaceAccess,
  ensurePersonalWorkspace,
} from "@/lib/db/connections";
import { canCreateConnection } from "@/lib/subscriptions";
import { createS3Client } from "@/lib/s3/client";
import {
  importAwsProfile,
  type ImportProfileRequest,
  type ImportProfileResult,
  type ValidateCredentialsResult,
} from "@/lib/aws/import-profiles";

interface ImportRequestBody {
  workspaceId?: string;
  profiles: ImportProfileRequest[];
}

function isProfile(value: unknown): value is ImportProfileRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    typeof v.region === "string" &&
    typeof v.accessKeyId === "string" &&
    typeof v.secretAccessKey === "string"
  );
}

function validateBody(body: unknown): ImportRequestBody | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.profiles) || b.profiles.length === 0) {
    return { error: "profiles must be a non-empty array" };
  }
  if (!b.profiles.every(isProfile)) {
    return { error: "every profile must have name, region, accessKeyId, secretAccessKey" };
  }
  return {
    workspaceId: typeof b.workspaceId === "string" ? b.workspaceId : undefined,
    profiles: b.profiles as ImportProfileRequest[],
  };
}

const SDK_ERROR_LABELS: Record<string, string> = {
  InvalidAccessKeyId: "InvalidAccessKeyId",
  SignatureDoesNotMatch: "SignatureDoesNotMatch",
  AccessDenied: "AccessDenied",
};

function mapSdkError(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    const name = String((err as { name: unknown }).name);
    if (SDK_ERROR_LABELS[name]) return SDK_ERROR_LABELS[name];
  }
  if (err && typeof err === "object" && "Code" in err) {
    const code = String((err as { Code: unknown }).Code);
    if (SDK_ERROR_LABELS[code]) return SDK_ERROR_LABELS[code];
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/network|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(message)) return "NetworkError";
  return "Unknown";
}

export const POST = withAuth(async (req, { user }) => {
  const rawBody = await req.json().catch(() => null);
  const parsed = validateBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let targetWorkspaceId: string;
  if (parsed.workspaceId) {
    const access = await getWorkspaceAccess(parsed.workspaceId, user.id);
    if (!access || access.role !== "ADMIN") {
      return NextResponse.json(
        { error: "You do not have permission to import into this workspace" },
        { status: 403 }
      );
    }
    targetWorkspaceId = access.workspace.id;
  } else {
    const personalWorkspace = await ensurePersonalWorkspace(user.id);
    targetWorkspaceId = personalWorkspace.id;
  }

  const tier = user.subscription?.tier ?? "FREE";
  const limitCheck = await canCreateConnection(targetWorkspaceId, tier);
  if (!limitCheck.allowed) {
    return NextResponse.json({ error: limitCheck.reason }, { status: 403 });
  }
  if (
    typeof limitCheck.current === "number" &&
    typeof limitCheck.limit === "number" &&
    limitCheck.current + parsed.profiles.length > limitCheck.limit
  ) {
    const remaining = Math.max(0, limitCheck.limit - limitCheck.current);
    return NextResponse.json(
      {
        error: `Importing ${parsed.profiles.length} profiles would exceed your ${limitCheck.limit}-connection limit (currently using ${limitCheck.current}). You can import up to ${remaining} more.`,
      },
      { status: 403 }
    );
  }

  const validateCredentials = async (input: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  }): Promise<ValidateCredentialsResult> => {
    try {
      const client = createS3Client({
        endpoint: "https://s3.amazonaws.com",
        region: input.region,
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.secretAccessKey,
        forcePathStyle: false,
      });
      await client.send(new ListBucketsCommand({}));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: mapSdkError(err) };
    }
  };

  const saveConnection = async (input: {
    name: string;
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  }): Promise<{ id: string }> => {
    const connection = await createConnection(
      user.id,
      {
        name: input.name,
        endpoint: input.endpoint,
        region: input.region,
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.secretAccessKey,
        forcePathStyle: input.forcePathStyle,
      },
      targetWorkspaceId
    );
    return { id: connection.id };
  };

  const settled = await Promise.allSettled(
    parsed.profiles.map((profile) =>
      importAwsProfile(profile, { validateCredentials, saveConnection })
    )
  );

  const results: ImportProfileResult[] = settled.map((entry, idx) => {
    if (entry.status === "fulfilled") return entry.value;
    return {
      name: parsed.profiles[idx].name,
      status: "invalid",
      error:
        entry.reason instanceof Error ? entry.reason.message : "Unknown error",
    };
  });

  return NextResponse.json({ results });
});
