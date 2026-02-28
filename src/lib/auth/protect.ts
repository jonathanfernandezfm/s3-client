import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import prisma from "@/lib/db/prisma";
import type { AuthUser } from "./clerk";

type RouteContext = {
  params?: Promise<Record<string, string>>;
};

type ProtectedHandler<T extends RouteContext = RouteContext> = (
  req: NextRequest,
  context: { user: AuthUser; params: T["params"] extends Promise<infer P> ? P : Record<string, string> }
) => Promise<NextResponse>;

/**
 * Wrapper for API routes that require authentication
 * Automatically fetches user and passes to handler
 */
export function withAuth<T extends RouteContext = RouteContext>(
  handler: ProtectedHandler<T>
) {
  return async (req: NextRequest, context?: T) => {
    try {
      const { userId } = await auth();

      if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      let user = await prisma.user.findUnique({
        where: { clerkId: userId },
        include: { subscription: true },
      });

      if (!user) {
        const clerkUser = await currentUser();
        if (!clerkUser) {
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const primaryEmail =
          clerkUser.emailAddresses.find(
            (email) => email.id === clerkUser.primaryEmailAddressId
          )?.emailAddress ??
          clerkUser.emailAddresses[0]?.emailAddress;

        if (!primaryEmail) {
          return NextResponse.json(
            { error: "User is missing an email address" },
            { status: 400 }
          );
        }

        user = await prisma.user.upsert({
          where: { clerkId: userId },
          update: {
            email: primaryEmail,
            firstName: clerkUser.firstName,
            lastName: clerkUser.lastName,
            imageUrl: clerkUser.imageUrl,
          },
          create: {
            clerkId: userId,
            email: primaryEmail,
            firstName: clerkUser.firstName,
            lastName: clerkUser.lastName,
            imageUrl: clerkUser.imageUrl,
            subscription: {
              create: {
                tier: "FREE",
              },
            },
            personalWorkspace: {
              create: {
                type: "PERSONAL",
              },
            },
          },
          include: { subscription: true },
        });
      }

      const params = context?.params ? await context.params : {};

      return handler(req, { user, params: params as T["params"] extends Promise<infer P> ? P : Record<string, string> });
    } catch (error) {
      console.error("Auth error:", error);
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 500 }
      );
    }
  };
}
