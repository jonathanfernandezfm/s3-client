import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getConnectionAccessById } from "@/lib/db/connections";
import { createS3Client } from "@/lib/s3/client";
import { readBucketSecurityPosture } from "@/lib/s3/security-posture";

type RouteContext = { params: Promise<{ id: string; bucket: string }> };

export const GET = withAuth<RouteContext>(async (_req, { user, params }) => {
  const { id, bucket } = params;
  const access = await getConnectionAccessById(id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const client = createS3Client(access.connection);
    const posture = await readBucketSecurityPosture(client, bucket);
    return NextResponse.json(posture);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
