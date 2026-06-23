import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import prisma from "@/lib/db/prisma";
import {
  buildSubscriptionUpsertFromCheckout,
  buildSubscriptionUpdateFromDeleted,
  buildSubscriptionUpdateFromUpdated,
  describePaymentFailure,
} from "./handler";
import { markWebhookProcessed, forgetWebhookEvent } from "@/lib/db/webhook-events";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const dedup = await markWebhookProcessed("STRIPE", event.id, event.type);
  if (dedup === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (!session.subscription) break;
        const sub = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        const payload = buildSubscriptionUpsertFromCheckout(session, sub);
        await prisma.subscription.upsert({
          where: { userId: payload.userId },
          create: payload,
          update: {
            tier: payload.tier,
            stripeCustomerId: payload.stripeCustomerId,
            stripeSubscriptionId: payload.stripeSubscriptionId,
            stripePriceId: payload.stripePriceId,
            currentPeriodStart: payload.currentPeriodStart,
            currentPeriodEnd: payload.currentPeriodEnd,
            cancelAtPeriodEnd: payload.cancelAtPeriodEnd,
          },
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const { where, data } = buildSubscriptionUpdateFromUpdated(sub);
        await prisma.subscription.updateMany({ where, data });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const { where, data } = buildSubscriptionUpdateFromDeleted(sub);
        await prisma.subscription.updateMany({ where, data });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const info = describePaymentFailure(invoice);
        const sub = info.stripeCustomerId
          ? await prisma.subscription.findUnique({
              where: { stripeCustomerId: info.stripeCustomerId },
              select: { userId: true },
            })
          : null;
        console.warn("[stripe] invoice.payment_failed", {
          ...info,
          userId: sub?.userId ?? null,
        });
        break;
      }
    }
  } catch (err) {
    console.error("Stripe webhook processing error", err);
    await forgetWebhookEvent("STRIPE", event.id);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
