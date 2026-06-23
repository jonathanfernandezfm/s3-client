import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import prisma from "@/lib/db/prisma";
import { markWebhookProcessed, forgetWebhookEvent } from "@/lib/db/webhook-events";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error("Missing CLERK_WEBHOOK_SECRET environment variable");
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return new Response("Webhook verification failed", { status: 400 });
  }

  const eventType = evt.type;

  const dedup = await markWebhookProcessed("CLERK", svix_id, eventType);
  if (dedup === "duplicate") {
    return new Response("Already processed", { status: 200 });
  }

  console.log("[clerk-webhook]", { svixId: svix_id, eventType });

  try {
    switch (eventType) {
      case "user.created": {
        const { id, email_addresses, first_name, last_name, image_url } =
          evt.data;
        const primaryEmail = email_addresses.find(
          (e) => e.id === evt.data.primary_email_address_id
        );

        await prisma.user.upsert({
          where: { clerkId: id },
          create: {
            clerkId: id,
            email: primaryEmail?.email_address ?? "",
            firstName: first_name,
            lastName: last_name,
            imageUrl: image_url,
            personalWorkspace: {
              create: {
                type: "PERSONAL",
              },
            },
            subscription: {
              create: {
                tier: "FREE",
              },
            },
          },
          update: {
            email: primaryEmail?.email_address ?? undefined,
            firstName: first_name,
            lastName: last_name,
            imageUrl: image_url,
          },
        });
        break;
      }

      case "user.updated": {
        const { id, email_addresses, first_name, last_name, image_url } =
          evt.data;
        const primaryEmail = email_addresses.find(
          (e) => e.id === evt.data.primary_email_address_id
        );

        await prisma.user.upsert({
          where: { clerkId: id },
          create: {
            clerkId: id,
            email: primaryEmail?.email_address ?? "",
            firstName: first_name,
            lastName: last_name,
            imageUrl: image_url,
            personalWorkspace: {
              create: {
                type: "PERSONAL",
              },
            },
            subscription: {
              create: {
                tier: "FREE",
              },
            },
          },
          update: {
            email: primaryEmail?.email_address ?? undefined,
            firstName: first_name,
            lastName: last_name,
            imageUrl: image_url,
          },
        });
        break;
      }

      case "user.deleted": {
        const { id } = evt.data;
        if (id) {
          // Cascade delete will handle subscription, connections, and usage records
          await prisma.user.deleteMany({ where: { clerkId: id } });
        }
        break;
      }
    }
  } catch (err) {
    console.error("[clerk-webhook] handler failed", {
      svixId: svix_id,
      eventType,
      err,
    });
    await forgetWebhookEvent("CLERK", svix_id);
    return new Response("Webhook handler failed", { status: 500 });
  }

  return new Response("Webhook processed", { status: 200 });
}
