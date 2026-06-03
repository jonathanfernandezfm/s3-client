import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { reorderBookmarks } from "@/lib/db/bookmarks";

// PATCH /api/bookmarks/reorder
export const PATCH = withAuth(async (req, { user }) => {
  try {
    const body = await req.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids must be a non-empty array" },
        { status: 400 },
      );
    }

    const reordered = await reorderBookmarks(user.id, ids);
    if (!reordered) {
      return NextResponse.json(
        { error: "One or more bookmark IDs are invalid" },
        { status: 403 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
