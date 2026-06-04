import { requireUser } from "@/lib/auth";
import { getTierLimits } from "@/lib/subscriptions";
import { getMonthlyUsage } from "@/lib/subscriptions/usage";
import { BillingTab } from "@/components/billing/billing-tab";
import prisma from "@/lib/db/prisma";

export default async function BillingPage() {
  const user = await requireUser();
  const tier = user.subscription?.tier ?? "FREE";
  const limits = getTierLimits(tier);
  const usage = await getMonthlyUsage(user.id);

  const connectionCount = await prisma.connection.count({
    where: {
      workspace: {
        OR: [
          { type: "PERSONAL", userId: user.id },
          { type: "TEAM", team: { members: { some: { userId: user.id } } } },
        ],
      },
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your plan and view your usage.
        </p>
      </div>
      <BillingTab
        tier={tier}
        limits={limits}
        usage={{ ...usage, connectionCount }}
        hasStripeCustomer={!!user.subscription?.stripeCustomerId}
      />
    </div>
  );
}
