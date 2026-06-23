import { describe, test, expect } from "vitest";
import {
  buildSubscriptionUpsertFromCheckout,
  buildSubscriptionUpdateFromDeleted,
  buildSubscriptionUpdateFromUpdated,
  describePaymentFailure,
} from "./handler";

describe("buildSubscriptionUpsertFromCheckout", () => {
  test("maps checkout session + stripe subscription to upsert payload", () => {
    const session = {
      customer: "cus_abc",
      subscription: "sub_xyz",
      metadata: { userId: "user_1" },
    };
    const sub = {
      id: "sub_xyz",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: "price_pro" },
            current_period_start: 1700000000,
            current_period_end: 1702592000,
          },
        ],
      },
    };

    const result = buildSubscriptionUpsertFromCheckout(session as never, sub as never);

    expect(result.userId).toBe("user_1");
    expect(result.tier).toBe("PRO");
    expect(result.stripeCustomerId).toBe("cus_abc");
    expect(result.stripeSubscriptionId).toBe("sub_xyz");
    expect(result.stripePriceId).toBe("price_pro");
    expect(result.currentPeriodStart).toEqual(new Date(1700000000 * 1000));
  });
});

describe("buildSubscriptionUpdateFromDeleted", () => {
  test("maps subscription deleted event to FREE downgrade payload", () => {
    const sub = { id: "sub_xyz" };
    const result = buildSubscriptionUpdateFromDeleted(sub as never);
    expect(result.where.stripeSubscriptionId).toBe("sub_xyz");
    expect(result.data.tier).toBe("FREE");
    expect(result.data.stripeSubscriptionId).toBeNull();
  });
});

describe("buildSubscriptionUpdateFromUpdated", () => {
  test("maps subscription updated event to period update payload", () => {
    const sub = {
      id: "sub_xyz",
      cancel_at_period_end: true,
      items: {
        data: [
          {
            price: { id: "price_pro" },
            current_period_start: 1700000000,
            current_period_end: 1702592000,
          },
        ],
      },
    };
    const result = buildSubscriptionUpdateFromUpdated(sub as never);
    expect(result.where.stripeSubscriptionId).toBe("sub_xyz");
    expect(result.data.cancelAtPeriodEnd).toBe(true);
    expect(result.data.tier).toBe("PRO");
    expect(result.data.stripePriceId).toBe("price_pro");
  });
});

describe("describePaymentFailure", () => {
  test("extracts stripeCustomerId when customer is a string", () => {
    const invoice = {
      id: "in_abc",
      customer: "cus_123",
      amount_due: 2000,
      attempt_count: 1,
    };
    const result = describePaymentFailure(invoice as never);
    expect(result.stripeCustomerId).toBe("cus_123");
    expect(result.invoiceId).toBe("in_abc");
    expect(result.amountDue).toBe(2000);
    expect(result.attemptCount).toBe(1);
  });

  test("extracts stripeCustomerId when customer is an object with .id", () => {
    const invoice = {
      id: "in_def",
      customer: { id: "cus_456", object: "customer" },
      amount_due: 5000,
      attempt_count: 2,
    };
    const result = describePaymentFailure(invoice as never);
    expect(result.stripeCustomerId).toBe("cus_456");
    expect(result.invoiceId).toBe("in_def");
  });

  test("sets stripeCustomerId to null when customer is missing", () => {
    const invoice = {
      id: "in_ghi",
      customer: null,
      amount_due: 1000,
      attempt_count: 1,
    };
    const result = describePaymentFailure(invoice as never);
    expect(result.stripeCustomerId).toBeNull();
    expect(result.invoiceId).toBe("in_ghi");
  });
});
