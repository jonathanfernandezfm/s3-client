import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export const POST = withAuth(async (req, { user }) => {
  const stripeCustomerId = user.subscription?.stripeCustomerId;

  if (!stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing customer found. Please upgrade first." },
      { status: 400 }
    );
  }

  const origin = new URL(req.url).origin;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${origin}/settings/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe portal error:", err);
    return NextResponse.json(
      { error: "Failed to create billing portal session. Please try again." },
      { status: 500 }
    );
  }
});
