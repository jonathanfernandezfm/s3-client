import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export const POST = withAuth(async (req, { user }) => {
  const tier = user.subscription?.tier ?? "FREE";
  if (tier !== "FREE") {
    return NextResponse.json(
      { error: "Already on a paid plan. Use the billing portal to manage your subscription." },
      { status: 400 }
    );
  }

  const origin = new URL(req.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
    customer_email: user.email,
    metadata: { userId: user.id },
    success_url: `${origin}/settings/billing?upgraded=true`,
    cancel_url: `${origin}/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
});
