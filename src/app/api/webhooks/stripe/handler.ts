import type Stripe from "stripe";

export function describePaymentFailure(invoice: Stripe.Invoice) {
  return {
    stripeCustomerId:
      typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id ?? null,
    invoiceId: invoice.id,
    amountDue: invoice.amount_due ?? null,
    attemptCount: invoice.attempt_count ?? null,
  };
}

export function buildSubscriptionUpsertFromCheckout(
  session: Stripe.Checkout.Session,
  sub: Stripe.Subscription
) {
  const userId = session.metadata?.userId;
  if (!userId) throw new Error("Missing userId in checkout session metadata");

  const item = sub.items.data[0];
  return {
    userId,
    tier: "PRO" as const,
    stripeCustomerId: session.customer as string,
    stripeSubscriptionId: sub.id,
    stripePriceId: item.price.id,
    currentPeriodStart: new Date(item.current_period_start * 1000),
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}

export function buildSubscriptionUpdateFromDeleted(sub: Stripe.Subscription) {
  return {
    where: { stripeSubscriptionId: sub.id },
    data: {
      tier: "FREE" as const,
      stripeSubscriptionId: null,
      stripePriceId: null,
      cancelAtPeriodEnd: false,
    },
  };
}

export function buildSubscriptionUpdateFromUpdated(sub: Stripe.Subscription) {
  return {
    where: { stripeSubscriptionId: sub.id },
    data: {
      tier: "PRO" as const,
      stripePriceId: sub.items.data[0].price.id,
      currentPeriodStart: new Date(sub.items.data[0].current_period_start * 1000),
      currentPeriodEnd: new Date(sub.items.data[0].current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  };
}
