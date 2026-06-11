import { NextResponse } from "next/server";
import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  type CORSRule,
} from "@aws-sdk/client-s3";
import { withAuth } from "@/lib/auth";
import { getConnectionAccessById } from "@/lib/db/connections";
import { createS3Client } from "@/lib/s3/client";
import { runBucketHealthCheck } from "@/lib/health/runner";

type RouteContext = { params: Promise<{ id: string; bucket: string }> };

const REQUIRED_CORS_RULE: CORSRule = {
  AllowedOrigins: ["*"],
  AllowedMethods: ["PUT"],
  AllowedHeaders: ["*"],
  ExposeHeaders: ["ETag"],
  MaxAgeSeconds: 3000,
};

export const POST = withAuth<RouteContext>(
  async (_req, { user, params }) => {
    const { id, bucket } = params;

    const access = await getConnectionAccessById(id, user.id);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (access.role !== "ADMIN") {
      return NextResponse.json(
        { error: "You do not have permission to update CORS configuration" },
        { status: 403 },
      );
    }

    const client = createS3Client(access.connection);

    let existingRules: CORSRule[] = [];
    try {
      const { CORSRules } = await client.send(
        new GetBucketCorsCommand({ Bucket: bucket }),
      );
      existingRules = CORSRules ?? [];
    } catch (err) {
      const e = err as { name?: string; Code?: string };
      const name = e.name ?? e.Code ?? "";
      if (name !== "NoSuchCORSConfiguration") {
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    try {
      await client.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: {
            CORSRules: [REQUIRED_CORS_RULE, ...existingRules],
          },
        }),
      );
    } catch (err) {
      const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
      const name = e.name ?? e.Code ?? "";
      const status = e.$metadata?.httpStatusCode;
      if (name === "AccessDenied" || status === 403) {
        return NextResponse.json(
          {
            error:
              "These credentials don't have permission to update CORS. Apply the config manually using the AWS CLI or your provider's console.",
          },
          { status: 400 },
        );
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    try {
      await runBucketHealthCheck(id, bucket);
    } catch {
      // Non-fatal — CORS was applied; the user can refresh manually
    }

    return NextResponse.json({ ok: true });
  },
);
