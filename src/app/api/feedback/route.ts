import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { z } from "zod";

const feedbackSchema = z.object({
  type: z.enum(["FEEDBACK", "BUG_REPORT"]),
  message: z.string().min(1).max(5000),
});

export const POST = withAuth(async (req, { user }) => {
  const body = await req.json();
  const parsed = feedbackSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const feedback = await prisma.feedback.create({
    data: {
      type: parsed.data.type,
      message: parsed.data.message,
      userId: user.id,
      userEmail: user.email,
    },
  });

  return NextResponse.json({ id: feedback.id }, { status: 201 });
});
