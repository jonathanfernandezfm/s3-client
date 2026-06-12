import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getConnectionAccessById } from "@/lib/db/connections";
import { indexTagsForKeys } from "@/lib/search/index-ops";

const MAX_KEYS = 500;

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const { connectionId, bucket, keys } = await req.json();

  if (!connectionId || !bucket || !Array.isArray(keys) || !keys.every((k) => typeof k === "string")) {
    return NextResponse.json(
      { error: "connectionId, bucket, and keys[] are required" },
      { status: 400 }
    );
  }

  if (keys.length > MAX_KEYS) {
    return NextResponse.json(
      { error: `Too many keys (max ${MAX_KEYS})` },
      { status: 400 }
    );
  }

  const access = await getConnectionAccessById(connectionId, user.id);
  if (!access) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const tags = await indexTagsForKeys({ connectionId, bucket, keys });
  return NextResponse.json({ tags });
});
