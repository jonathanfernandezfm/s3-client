# Subscription Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a FREE/PRO/ENTERPRISE subscription tier system with Stripe Checkout, feature gates, contextual upgrade prompts, and a billing settings page.

**Architecture:** Dual enforcement — `<FeatureGate>` React components intercept PRO-only UI for FREE users and open a plans modal; API routes enforce limits server-side as a backstop. Stripe Checkout handles new subscriptions; Stripe Customer Portal handles cancellations. A Zustand store (`useUpgradeModalStore`) drives the global plans modal.

**Tech Stack:** Next.js App Router, Stripe SDK v16+, Prisma, React Query, Zustand, Radix UI, Tailwind CSS 4, Vitest.

---

## File Map

**New files:**
- `src/lib/subscriptions/gates.ts` — `canAccessFeature(tier, feature)` pure function + `GatedFeature` type
- `src/lib/subscriptions/tiers.test.ts` — verify updated tier config values
- `src/lib/subscriptions/gates.test.ts` — unit tests for `canAccessFeature`
- `src/lib/stripe.ts` — Stripe client singleton
- `src/hooks/use-tier.ts` — React Query hook returning `{ tier, limits, can(feature) }`
- `src/app/api/user/subscription/route.ts` — GET endpoint returning `{ tier, limits }`
- `src/app/api/billing/checkout/route.ts` — POST creates Stripe Checkout Session
- `src/app/api/billing/portal/route.ts` — POST creates Stripe Customer Portal session
- `src/app/api/webhooks/stripe/route.ts` — POST handles Stripe webhook lifecycle events
- `src/lib/stores/upgrade-modal-store.ts` — Zustand store for plans modal open/close
- `src/components/billing/plans-modal.tsx` — 3-column plan comparison dialog
- `src/components/shared/feature-gate.tsx` — wrapper component for PRO-locked UI elements
- `src/components/billing/locked-page-overlay.tsx` — full-page locked overlay for PRO-only pages
- `src/app/(dashboard)/settings/billing/page.tsx` — billing settings page (server component)
- `src/components/billing/billing-tab.tsx` — billing tab client component (usage meters, plan card)

**Modified files:**
- `src/lib/subscriptions/tiers.ts` — add `shareLinks`, `teams`, `activityRetentionDays`; update PRO limits
- `src/lib/subscriptions/check-limits.ts` — remove `canUploadMonthlyVolume` + `canDownloadMonthlyVolume`
- `src/lib/subscriptions/index.ts` — update exports
- `src/lib/queries/keys.ts` — add `user.subscription` query key
- `src/app/api/objects/upload/route.ts` — remove `canUploadMonthlyVolume` call
- `src/app/api/activity/query-helpers.ts` — add `sinceDate` param to `buildWhereClause`
- `src/app/api/activity/route.ts` — pass retention cutoff date to `buildWhereClause`
- `src/app/api/share-links/route.ts` — add PRO feature gate on POST
- `src/app/api/teams/route.ts` — add PRO feature gate on POST
- `src/components/shared/app-sidebar.tsx` — add PRO badges to Shares + Teams nav items
- `src/app/(dashboard)/shares/page.tsx` — add `LockedPageOverlay` for FREE users
- `src/app/(dashboard)/teams/page.tsx` — add `LockedPageOverlay` for FREE users
- `src/app/(dashboard)/layout.tsx` — render `PlansModal` globally
- `.env.example` — add Stripe env vars

---

## Task 1: Update tier config + remove bandwidth enforcement

**Files:**
- Modify: `src/lib/subscriptions/tiers.ts`
- Modify: `src/lib/subscriptions/check-limits.ts`
- Modify: `src/lib/subscriptions/index.ts`
- Modify: `src/app/api/objects/upload/route.ts`
- Create: `src/lib/subscriptions/tiers.test.ts`

- [ ] **Step 1: Write failing tests for updated tier config**

```ts
// src/lib/subscriptions/tiers.test.ts
import { describe, test, expect } from "vitest";
import { TIER_LIMITS, isUnlimited } from "./tiers";

describe("TIER_LIMITS", () => {
  test("FREE has 2 max connections", () => {
    expect(TIER_LIMITS.FREE.maxConnections).toBe(2);
  });

  test("FREE has 50MB upload limit", () => {
    expect(TIER_LIMITS.FREE.maxUploadSizeMB).toBe(50);
  });

  test("PRO has unlimited upload size", () => {
    expect(isUnlimited(TIER_LIMITS.PRO.maxUploadSizeMB)).toBe(true);
  });

  test("FREE shareLinks is false", () => {
    expect(TIER_LIMITS.FREE.shareLinks).toBe(false);
  });

  test("PRO shareLinks is true", () => {
    expect(TIER_LIMITS.PRO.shareLinks).toBe(true);
  });

  test("FREE teams disabled", () => {
    expect(TIER_LIMITS.FREE.teams.enabled).toBe(false);
  });

  test("PRO teams enabled with 1 team and 5 members", () => {
    expect(TIER_LIMITS.PRO.teams.enabled).toBe(true);
    expect(TIER_LIMITS.PRO.teams.maxTeams).toBe(1);
    expect(TIER_LIMITS.PRO.teams.maxMembersPerTeam).toBe(5);
  });

  test("FREE activity retention is 30 days", () => {
    expect(TIER_LIMITS.FREE.activityRetentionDays).toBe(30);
  });

  test("PRO activity retention is 90 days", () => {
    expect(TIER_LIMITS.PRO.activityRetentionDays).toBe(90);
  });

  test("ENTERPRISE activity retention is unlimited", () => {
    expect(isUnlimited(TIER_LIMITS.ENTERPRISE.activityRetentionDays)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run src/lib/subscriptions/tiers.test.ts
```

Expected: FAIL — properties `shareLinks`, `teams`, `activityRetentionDays` don't exist yet.

- [ ] **Step 3: Update `tiers.ts`**

Replace the entire file with:

```ts
// src/lib/subscriptions/tiers.ts
import type { SubscriptionTier } from "@/generated/prisma/client";

export interface TeamLimits {
  enabled: boolean;
  maxTeams: number;       // -1 = unlimited
  maxMembersPerTeam: number; // -1 = unlimited
}

export interface TierConfig {
  maxConnections: number;
  maxUploadSizeMB: number;
  monthlyOperations: number;
  shareLinks: boolean;
  teams: TeamLimits;
  activityRetentionDays: number; // -1 = unlimited
}

export const TIER_LIMITS: Record<SubscriptionTier, TierConfig> = {
  FREE: {
    maxConnections: 2,
    maxUploadSizeMB: 50,
    monthlyOperations: 1000,
    shareLinks: false,
    teams: { enabled: false, maxTeams: 0, maxMembersPerTeam: 0 },
    activityRetentionDays: 30,
  },
  PRO: {
    maxConnections: 10,
    maxUploadSizeMB: -1,
    monthlyOperations: 50000,
    shareLinks: true,
    teams: { enabled: true, maxTeams: 1, maxMembersPerTeam: 5 },
    activityRetentionDays: 90,
  },
  ENTERPRISE: {
    maxConnections: -1,
    maxUploadSizeMB: -1,
    monthlyOperations: -1,
    shareLinks: true,
    teams: { enabled: true, maxTeams: -1, maxMembersPerTeam: -1 },
    activityRetentionDays: -1,
  },
};

export type TierLimits = TierConfig;

export function getTierLimits(tier: SubscriptionTier): TierConfig {
  return TIER_LIMITS[tier];
}

export function isUnlimited(limit: number): boolean {
  return limit === -1;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function getTierDisplayName(tier: SubscriptionTier): string {
  const names: Record<SubscriptionTier, string> = {
    FREE: "Free",
    PRO: "Pro",
    ENTERPRISE: "Enterprise",
  };
  return names[tier];
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run src/lib/subscriptions/tiers.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Remove bandwidth check functions from `check-limits.ts`**

Remove the `canUploadMonthlyVolume` and `canDownloadMonthlyVolume` functions entirely. The file should contain only `canCreateConnection`, `canUploadFileSize`, and `canPerformOperation`. Also remove the `getMonthStart` helper — it's still used by `canPerformOperation`, so keep it.

The final `check-limits.ts`:

```ts
// src/lib/subscriptions/check-limits.ts
import prisma from "@/lib/db/prisma";
import { TIER_LIMITS, isUnlimited } from "./tiers";
import type { SubscriptionTier } from "@/generated/prisma/client";

export type LimitCheckResult = {
  allowed: boolean;
  reason?: string;
  current?: number;
  limit?: number;
};

export async function canCreateConnection(
  workspaceId: string,
  tier: SubscriptionTier
): Promise<LimitCheckResult> {
  const limit = TIER_LIMITS[tier].maxConnections;

  if (isUnlimited(limit)) {
    return { allowed: true };
  }

  const count = await prisma.connection.count({
    where: { workspaceId },
  });

  if (count >= limit) {
    return {
      allowed: false,
      reason: `You have reached the maximum of ${limit} connections for your ${tier} plan. Upgrade to add more connections.`,
      current: count,
      limit,
    };
  }

  return { allowed: true, current: count, limit };
}

export function canUploadFileSize(
  fileSizeBytes: number,
  tier: SubscriptionTier
): LimitCheckResult {
  const limitMB = TIER_LIMITS[tier].maxUploadSizeMB;

  if (isUnlimited(limitMB)) {
    return { allowed: true };
  }

  const fileSizeMB = fileSizeBytes / (1024 * 1024);

  if (fileSizeMB > limitMB) {
    return {
      allowed: false,
      reason: `File size (${Math.round(fileSizeMB)}MB) exceeds the ${limitMB}MB limit for your ${tier} plan. Upgrade to upload larger files.`,
      current: Math.round(fileSizeMB),
      limit: limitMB,
    };
  }

  return { allowed: true };
}

export async function canPerformOperation(
  userId: string,
  tier: SubscriptionTier
): Promise<LimitCheckResult> {
  const limit = TIER_LIMITS[tier].monthlyOperations;

  if (isUnlimited(limit)) {
    return { allowed: true };
  }

  const startOfMonth = getMonthStart();

  const usage = await prisma.usageRecord.findUnique({
    where: { userId_month: { userId, month: startOfMonth } },
  });

  const currentCount = usage?.operationCount ?? 0;

  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `Monthly operation limit of ${limit.toLocaleString()} reached for your ${tier} plan. Upgrade for more operations.`,
      current: currentCount,
      limit,
    };
  }

  return { allowed: true, current: currentCount, limit };
}

function getMonthStart(): Date {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}
```

- [ ] **Step 6: Update `subscriptions/index.ts` exports**

```ts
// src/lib/subscriptions/index.ts
export {
  TIER_LIMITS,
  getTierLimits,
  isUnlimited,
  formatBytes,
  getTierDisplayName,
  type TierLimits,
  type TierConfig,
  type TeamLimits,
} from "./tiers";

export {
  canCreateConnection,
  canUploadFileSize,
  canPerformOperation,
  type LimitCheckResult,
} from "./check-limits";

export {
  recordUpload,
  recordDownload,
  recordOperation,
  getMonthlyUsage,
} from "./usage";
```

- [ ] **Step 7: Remove `canUploadMonthlyVolume` call from the upload route**

In `src/app/api/objects/upload/route.ts`, remove the import of `canUploadMonthlyVolume` and remove this block (approximately lines 50–55):

```ts
// Remove this block entirely:
const volumeCheck = await canUploadMonthlyVolume(user.id, tier, file.size);
if (!volumeCheck.allowed) {
  return NextResponse.json({ error: volumeCheck.reason }, { status: 403 });
}
```

Also update the import at the top to remove `canUploadMonthlyVolume` and `recordUpload` is kept (usage tracking is still recorded):

```ts
import {
  canUploadFileSize,
  recordUpload,
} from "@/lib/subscriptions";
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/subscriptions/tiers.ts src/lib/subscriptions/tiers.test.ts \
        src/lib/subscriptions/check-limits.ts src/lib/subscriptions/index.ts \
        src/app/api/objects/upload/route.ts
git commit -m "feat: update tier config with feature gates + remove bandwidth enforcement"
```

---

## Task 2: Feature gates module

**Files:**
- Create: `src/lib/subscriptions/gates.ts`
- Create: `src/lib/subscriptions/gates.test.ts`
- Modify: `src/lib/subscriptions/index.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/subscriptions/gates.test.ts
import { describe, test, expect } from "vitest";
import { canAccessFeature } from "./gates";

describe("canAccessFeature", () => {
  test("FREE cannot access shareLinks", () => {
    expect(canAccessFeature("FREE", "shareLinks")).toBe(false);
  });

  test("FREE cannot access teams", () => {
    expect(canAccessFeature("FREE", "teams")).toBe(false);
  });

  test("PRO can access shareLinks", () => {
    expect(canAccessFeature("PRO", "shareLinks")).toBe(true);
  });

  test("PRO can access teams", () => {
    expect(canAccessFeature("PRO", "teams")).toBe(true);
  });

  test("ENTERPRISE can access shareLinks", () => {
    expect(canAccessFeature("ENTERPRISE", "shareLinks")).toBe(true);
  });

  test("ENTERPRISE can access teams", () => {
    expect(canAccessFeature("ENTERPRISE", "teams")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run src/lib/subscriptions/gates.test.ts
```

Expected: FAIL — `gates.ts` does not exist.

- [ ] **Step 3: Create `gates.ts`**

```ts
// src/lib/subscriptions/gates.ts
import type { SubscriptionTier } from "@/generated/prisma/client";

export type GatedFeature = "shareLinks" | "teams";

const FEATURE_TIERS: Record<GatedFeature, SubscriptionTier[]> = {
  shareLinks: ["PRO", "ENTERPRISE"],
  teams: ["PRO", "ENTERPRISE"],
};

export function canAccessFeature(
  tier: SubscriptionTier,
  feature: GatedFeature
): boolean {
  return FEATURE_TIERS[feature].includes(tier);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run src/lib/subscriptions/gates.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Export from `subscriptions/index.ts`**

Add to the exports in `src/lib/subscriptions/index.ts`:

```ts
export { canAccessFeature, type GatedFeature } from "./gates";
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/subscriptions/gates.ts src/lib/subscriptions/gates.test.ts \
        src/lib/subscriptions/index.ts
git commit -m "feat: add feature gates module with canAccessFeature"
```

---

## Task 3: User subscription API endpoint + useTier hook

**Files:**
- Create: `src/app/api/user/subscription/route.ts`
- Modify: `src/lib/queries/keys.ts`
- Create: `src/hooks/use-tier.ts`

- [ ] **Step 1: Add `user.subscription` query key**

In `src/lib/queries/keys.ts`, add a `user` section to the `queryKeys` object:

```ts
// Add inside the queryKeys object (alongside buckets, objects, etc.):
user: {
  subscription: () => ["user", "subscription"] as const,
},
```

- [ ] **Step 2: Create the subscription API endpoint**

```ts
// src/app/api/user/subscription/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getTierLimits } from "@/lib/subscriptions";

export const GET = withAuth(async (_req, { user }) => {
  const tier = user.subscription?.tier ?? "FREE";
  const limits = getTierLimits(tier);
  return NextResponse.json({ tier, limits });
});
```

- [ ] **Step 3: Create the `useTier` hook**

```ts
// src/hooks/use-tier.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries/keys";
import { TIER_LIMITS, type TierConfig } from "@/lib/subscriptions";
import { canAccessFeature, type GatedFeature } from "@/lib/subscriptions/gates";
import type { SubscriptionTier } from "@/generated/prisma/client";

interface SubscriptionResponse {
  tier: SubscriptionTier;
  limits: TierConfig;
}

export function useTier() {
  const { data } = useQuery<SubscriptionResponse>({
    queryKey: queryKeys.user.subscription(),
    queryFn: async () => {
      const res = await fetch("/api/user/subscription");
      if (!res.ok) throw new Error("Failed to fetch subscription");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const tier: SubscriptionTier = data?.tier ?? "FREE";
  const limits: TierConfig = data?.limits ?? TIER_LIMITS.FREE;

  return {
    tier,
    limits,
    can: (feature: GatedFeature) => canAccessFeature(tier, feature),
  };
}
```

- [ ] **Step 4: Manually verify the endpoint works**

Start the dev server (`pnpm dev`) and sign in. Open the browser devtools network tab and navigate to any page. You should see a request to `/api/user/subscription` returning `{ tier: "FREE", limits: { ... } }`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/user/subscription/route.ts src/lib/queries/keys.ts \
        src/hooks/use-tier.ts
git commit -m "feat: add user subscription API endpoint and useTier hook"
```

---

## Task 4: Stripe setup

**Files:**
- Create: `src/lib/stripe.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install the Stripe package**

```bash
pnpm add stripe
```

Expected: `stripe` appears in `package.json` dependencies.

- [ ] **Step 2: Create the Stripe client singleton**

```ts
// src/lib/stripe.ts
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
```

- [ ] **Step 3: Add Stripe vars to `.env.example`**

Append to `.env.example`:

```bash
# Stripe Billing
# ==============
# Get these from https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Create a recurring price in Stripe Dashboard and paste the price ID here
# Product: "S3 Dock PRO", Price: $4/month (recurring)
STRIPE_PRO_PRICE_ID=price_...
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/stripe.ts .env.example package.json pnpm-lock.yaml
git commit -m "feat: add Stripe client singleton and env config"
```

---

## Task 5: Billing checkout + portal API routes

**Files:**
- Create: `src/app/api/billing/checkout/route.ts`
- Create: `src/app/api/billing/portal/route.ts`

- [ ] **Step 1: Create the checkout route**

```ts
// src/app/api/billing/checkout/route.ts
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
```

- [ ] **Step 2: Create the portal route**

```ts
// src/app/api/billing/portal/route.ts
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

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${origin}/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
});
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/billing/checkout/route.ts src/app/api/billing/portal/route.ts
git commit -m "feat: add Stripe checkout and customer portal API routes"
```

---

## Task 6: Stripe webhook handler

**Files:**
- Create: `src/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Write a test for the webhook event handler logic**

```ts
// src/app/api/webhooks/stripe/handler.test.ts
import { describe, test, expect } from "vitest";
import {
  buildSubscriptionUpsertFromCheckout,
  buildSubscriptionUpdateFromDeleted,
  buildSubscriptionUpdateFromUpdated,
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
      current_period_start: 1700000000,
      current_period_end: 1702592000,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_pro" } }] },
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
      current_period_start: 1700000000,
      current_period_end: 1702592000,
      cancel_at_period_end: true,
    };
    const result = buildSubscriptionUpdateFromUpdated(sub as never);
    expect(result.where.stripeSubscriptionId).toBe("sub_xyz");
    expect(result.data.cancelAtPeriodEnd).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run src/app/api/webhooks/stripe/handler.test.ts
```

Expected: FAIL — handler module does not exist.

- [ ] **Step 3: Create the pure handler functions module**

```ts
// src/app/api/webhooks/stripe/handler.ts
import type Stripe from "stripe";

export function buildSubscriptionUpsertFromCheckout(
  session: Stripe.Checkout.Session,
  sub: Stripe.Subscription
) {
  const userId = session.metadata?.userId;
  if (!userId) throw new Error("Missing userId in checkout session metadata");

  return {
    userId,
    tier: "PRO" as const,
    stripeCustomerId: session.customer as string,
    stripeSubscriptionId: sub.id,
    stripePriceId: sub.items.data[0].price.id,
    currentPeriodStart: new Date(sub.current_period_start * 1000),
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
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
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run src/app/api/webhooks/stripe/handler.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Create the webhook route**

```ts
// src/app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import prisma from "@/lib/db/prisma";
import {
  buildSubscriptionUpsertFromCheckout,
  buildSubscriptionUpdateFromDeleted,
  buildSubscriptionUpdateFromUpdated,
} from "./handler";

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

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
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
        // Logged for now; future: send email / show warning banner
        console.warn("Stripe invoice.payment_failed", event.data.object);
        break;
      }
    }
  } catch (err) {
    console.error("Stripe webhook processing error", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts src/app/api/webhooks/stripe/handler.ts \
        src/app/api/webhooks/stripe/handler.test.ts
git commit -m "feat: add Stripe webhook handler for subscription lifecycle"
```

---

## Task 7: Enforce feature gates at the API layer

**Files:**
- Modify: `src/app/api/share-links/route.ts`
- Modify: `src/app/api/teams/route.ts`
- Modify: `src/app/api/activity/query-helpers.ts`
- Modify: `src/app/api/activity/route.ts`

- [ ] **Step 1: Add PRO gate to share-links POST**

In `src/app/api/share-links/route.ts`, add the following import at the top:

```ts
import { canAccessFeature } from "@/lib/subscriptions/gates";
```

Then add this block at the very beginning of the `POST` handler body (before any other logic):

```ts
const tier = user.subscription?.tier ?? "FREE";
if (!canAccessFeature(tier, "shareLinks")) {
  return NextResponse.json(
    { error: "Share links require a PRO subscription." },
    { status: 403 }
  );
}
```

- [ ] **Step 2: Add PRO gate to teams POST**

In `src/app/api/teams/route.ts`, add the import:

```ts
import { canAccessFeature } from "@/lib/subscriptions/gates";
```

Then add this block at the very beginning of the `POST` handler body:

```ts
const tier = user.subscription?.tier ?? "FREE";
if (!canAccessFeature(tier, "teams")) {
  return NextResponse.json(
    { error: "Teams require a PRO subscription." },
    { status: 403 }
  );
}
```

- [ ] **Step 3: Add `sinceDate` to `buildWhereClause` in `query-helpers.ts`**

In `src/app/api/activity/query-helpers.ts`, add `sinceDate` to the `WhereParams` type and handle it in the function:

```ts
// Update WhereParams type (add sinceDate field):
type WhereParams = {
  connectionId: string;
  bucket: string;
  prefix?: string | null;
  key?: string | null;
  userId?: string | null;
  actions?: string[] | null;
  cursor?: Cursor | null;
  sinceDate?: Date | null; // ADD THIS
};

// Add inside buildWhereClause, after the actions block:
if (params.sinceDate) {
  where.createdAt = { gte: params.sinceDate };
}
```

Also add this helper function at the bottom of `query-helpers.ts`:

```ts
/**
 * Returns the oldest allowed activity date for a given retention period.
 * Returns null if retention is unlimited.
 */
export function getActivityRetentionCutoff(retentionDays: number): Date | null {
  if (retentionDays === -1) return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}
```

- [ ] **Step 4: Apply retention filter in the activity route**

In `src/app/api/activity/route.ts`, add these imports:

```ts
import { getTierLimits } from "@/lib/subscriptions";
import { getActivityRetentionCutoff } from "./query-helpers";
```

Then, before the `buildWhereClause` call, compute the retention cutoff:

```ts
const tier = user.subscription?.tier ?? "FREE";
const limits = getTierLimits(tier);
const retentionCutoff = getActivityRetentionCutoff(limits.activityRetentionDays);

const where = buildWhereClause({
  connectionId,
  bucket,
  prefix,
  key,
  userId,
  actions,
  cursor,
  sinceDate: retentionCutoff, // ADD THIS
});
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/share-links/route.ts src/app/api/teams/route.ts \
        src/app/api/activity/query-helpers.ts src/app/api/activity/route.ts
git commit -m "feat: enforce share links, teams, and activity retention gates in API"
```

---

## Task 8: FeatureGate component + upgrade modal store

**Files:**
- Create: `src/lib/stores/upgrade-modal-store.ts`
- Create: `src/components/shared/feature-gate.tsx`

- [ ] **Step 1: Create the upgrade modal Zustand store**

```ts
// src/lib/stores/upgrade-modal-store.ts
import { create } from "zustand";

interface UpgradeModalStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useUpgradeModalStore = create<UpgradeModalStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
```

- [ ] **Step 2: Create the FeatureGate component**

```tsx
// src/components/shared/feature-gate.tsx
"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTier } from "@/hooks/use-tier";
import { useUpgradeModalStore } from "@/lib/stores/upgrade-modal-store";
import type { GatedFeature } from "@/lib/subscriptions/gates";

interface FeatureGateProps {
  feature: GatedFeature;
  /** Display name shown in tooltip, e.g. "Share Links" */
  label: string;
  children: React.ReactNode;
}

export function FeatureGate({ feature, label, children }: FeatureGateProps) {
  const { can } = useTier();
  const openModal = useUpgradeModalStore((s) => s.open);

  if (can(feature)) return <>{children}</>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="relative inline-flex cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openModal();
            }}
          >
            <span className="pointer-events-none opacity-50">{children}</span>
            <span className="absolute -right-1 -top-1 rounded-full border border-blue-500/30 bg-blue-500/20 px-1 text-[8px] font-medium text-blue-400">
              PRO
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <p className="text-xs font-medium">{label} · PRO feature</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Upgrade for $4/mo →
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/upgrade-modal-store.ts src/components/shared/feature-gate.tsx
git commit -m "feat: add FeatureGate component and upgrade modal store"
```

---

## Task 9: Plans modal component

**Files:**
- Create: `src/components/billing/plans-modal.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create the plans modal**

```tsx
// src/components/billing/plans-modal.tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { useUpgradeModalStore } from "@/lib/stores/upgrade-modal-store";
import { useTier } from "@/hooks/use-tier";

const PRO_FEATURES = [
  "10 connections",
  "Unlimited file uploads",
  "50,000 operations/month",
  "Share links (password, expiry, analytics)",
  "1 team · 5 members",
  "90-day activity history",
];

const FREE_FEATURES = [
  "2 connections",
  "50 MB file uploads",
  "1,000 operations/month",
  "File notes",
  "30-day activity history",
];

const FREE_MISSING = ["Share links", "Teams"];

interface PlansModalProps {
  /** When provided, the modal is controlled externally (e.g. from BillingTab). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PlansModal({ open: controlledOpen, onOpenChange }: PlansModalProps = {}) {
  const { isOpen: storeOpen, close } = useUpgradeModalStore();
  const isOpen = controlledOpen ?? storeOpen;
  const { tier } = useTier();
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function handleOpenChange(val: boolean) {
    onOpenChange?.(val);
    if (!val) close();
  }

  async function handleUpgrade() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose your plan</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Simple pricing, cancel anytime.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4 pt-2">
          {/* FREE */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Free
            </p>
            <p className="mt-1 text-2xl font-bold">$0</p>
            <p className="text-xs text-muted-foreground">forever</p>
            <div className="mt-4 space-y-1.5 border-t pt-4">
              {FREE_FEATURES.map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="h-3 w-3 shrink-0 text-green-500" />
                  {f}
                </div>
              ))}
              {FREE_MISSING.map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground/50">
                  <X className="h-3 w-3 shrink-0" />
                  {f}
                </div>
              ))}
            </div>
            <Button variant="secondary" className="mt-4 w-full" disabled>
              {tier === "FREE" ? "Current plan" : "Downgrade"}
            </Button>
          </div>

          {/* PRO */}
          <div className="relative rounded-lg border border-blue-500/50 bg-blue-500/5 p-4">
            <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px]">
              POPULAR
            </Badge>
            <p className="text-xs font-medium uppercase tracking-widest text-blue-400">
              Pro
            </p>
            <p className="mt-1 text-2xl font-bold">$4</p>
            <p className="text-xs text-muted-foreground">per month</p>
            <div className="mt-4 space-y-1.5 border-t pt-4">
              {PRO_FEATURES.map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="h-3 w-3 shrink-0 text-green-500" />
                  {f}
                </div>
              ))}
            </div>
            <Button
              className="mt-4 w-full bg-blue-500 hover:bg-blue-600"
              onClick={handleUpgrade}
              disabled={loading || tier !== "FREE"}
            >
              {loading
                ? "Redirecting..."
                : tier === "FREE"
                ? "Upgrade to PRO"
                : "Current plan"}
            </Button>
          </div>

          {/* ENTERPRISE */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Enterprise
            </p>
            <p className="mt-1 text-2xl font-bold">Custom</p>
            <p className="text-xs text-muted-foreground">&nbsp;</p>
            <div className="mt-4 space-y-1.5 border-t pt-4">
              {[
                "Unlimited connections",
                "Unlimited uploads",
                "All PRO features",
                "Unlimited teams",
                "Unlimited activity history",
                "Priority support + SLA",
              ].map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="h-3 w-3 shrink-0 text-green-500" />
                  {f}
                </div>
              ))}
            </div>
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => {
                // Replace with your contact email or form URL
                window.location.href = "mailto:hello@s3dock.app";
              }}
            >
              Contact us
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Mount PlansModal in the dashboard layout**

In `src/app/(dashboard)/layout.tsx`, add the import and render the modal:

```tsx
// Add import:
import { PlansModal } from "@/components/billing/plans-modal";

// Add inside the JSX, alongside <InfoDrawer />, <Notifications />, etc.:
<PlansModal />
```

The final layout JSX should look like:

```tsx
return (
  <DragProvider>
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
      </div>
    </div>
    <InfoDrawer />
    <Notifications />
    <CommandPaletteMount />
    <PlansModal />
  </DragProvider>
);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/billing/plans-modal.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "feat: add PlansModal component and mount in dashboard layout"
```

---

## Task 10: Page-level locked overlay + Shares/Teams pages

**Files:**
- Create: `src/components/billing/locked-page-overlay.tsx`
- Modify: `src/app/(dashboard)/shares/page.tsx`
- Modify: `src/app/(dashboard)/teams/page.tsx`

- [ ] **Step 1: Create the locked page overlay**

```tsx
// src/components/billing/locked-page-overlay.tsx
"use client";

import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpgradeModalStore } from "@/lib/stores/upgrade-modal-store";

interface LockedPageOverlayProps {
  feature: string;
  description: string;
}

export function LockedPageOverlay({ feature, description }: LockedPageOverlayProps) {
  const openModal = useUpgradeModalStore((s) => s.open);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="rounded-full bg-muted p-4">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold">{feature}</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-blue-500/30 bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-400">
          PRO feature
        </span>
      </div>
      <Button className="bg-blue-500 hover:bg-blue-600" onClick={openModal}>
        Upgrade to PRO — $4/mo
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Gate the Shares page**

`src/app/(dashboard)/shares/page.tsx` is a `"use client"` component. Add the tier check at the top of the default export (or the outermost component). Add these imports:

```ts
import { useTier } from "@/hooks/use-tier";
import { LockedPageOverlay } from "@/components/billing/locked-page-overlay";
```

Then in the default export's render, check before returning the main content:

```tsx
export default function SharesPage() {
  const { can } = useTier();

  if (!can("shareLinks")) {
    return (
      <LockedPageOverlay
        feature="Share Links"
        description="Generate secure, shareable links for any file in your buckets — with optional password protection, expiration dates, and usage analytics."
      />
    );
  }

  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
      <SharesContent />
    </Suspense>
  );
}
```

> **Note:** Read the full current `shares/page.tsx` to find the exact default export before making this edit. The existing Suspense fallback content should be preserved — only the tier check and overlay are added.

- [ ] **Step 3: Gate the Teams page**

`src/app/(dashboard)/teams/page.tsx` is also `"use client"`. Add the same imports and tier check to the `TeamsPage` default export:

```ts
import { useTier } from "@/hooks/use-tier";
import { LockedPageOverlay } from "@/components/billing/locked-page-overlay";
```

At the very top of `TeamsPage`'s render, before any existing JSX:

```tsx
export default function TeamsPage() {
  const { can } = useTier();

  if (!can("teams")) {
    return (
      <LockedPageOverlay
        feature="Teams"
        description="Create a shared workspace and invite colleagues to collaborate on your S3 connections."
      />
    );
  }

  // ... rest of existing component unchanged
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/billing/locked-page-overlay.tsx \
        src/app/\(dashboard\)/shares/page.tsx \
        src/app/\(dashboard\)/teams/page.tsx
git commit -m "feat: add LockedPageOverlay and gate Shares/Teams pages for FREE users"
```

---

## Task 11: Sidebar PRO badges

**Files:**
- Modify: `src/components/shared/app-sidebar.tsx`

- [ ] **Step 1: Add PRO badges to Shares and Teams sidebar items**

`app-sidebar.tsx` is already a `"use client"` component. Add the `useTier` import:

```ts
import { useTier } from "@/hooks/use-tier";
```

Inside the sidebar component, get the tier:

```ts
const { can } = useTier();
```

Find the Shares link (around `href="/shares"`) and Teams link (around `href="/teams"` / `router.push("/teams")`). For each, add a PRO badge when `can("shareLinks")` / `can("teams")` is false.

For the **Shares** link, the JSX currently renders something like:

```tsx
<Link href="/shares" className={cn(...)}>
  <Link2 className="h-4 w-4" />
  Shares
</Link>
```

Update it to:

```tsx
<Link href="/shares" className={cn(...)}>
  <Link2 className="h-4 w-4" />
  Shares
  {!can("shareLinks") && (
    <span className="ml-auto rounded-full border border-blue-500/30 bg-blue-500/20 px-1.5 text-[8px] font-medium text-blue-400">
      PRO
    </span>
  )}
</Link>
```

Apply the same pattern to the **Teams** navigation item.

> **Note:** Read the full sidebar component to find the exact JSX for these items before editing, as the structure includes icon buttons and dropdowns.

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/app-sidebar.tsx
git commit -m "feat: add PRO badges to Shares and Teams sidebar items"
```

---

## Task 12: Settings Billing page

**Files:**
- Create: `src/components/billing/billing-tab.tsx`
- Create: `src/app/(dashboard)/settings/billing/page.tsx`

- [ ] **Step 1: Create the BillingTab client component**

```tsx
// src/components/billing/billing-tab.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlansModal } from "./plans-modal";
import type { TierConfig } from "@/lib/subscriptions";
import type { SubscriptionTier } from "@/generated/prisma/client";

interface UsageSummary {
  operationCount: number;
  uploadBytes: number;
  downloadBytes: number;
  connectionCount: number;
}

interface BillingTabProps {
  tier: SubscriptionTier;
  limits: TierConfig;
  usage: UsageSummary;
  hasStripeCustomer: boolean;
}

function UsageMeter({
  label,
  current,
  limit,
  formatValue,
}: {
  label: string;
  current: number;
  limit: number;
  formatValue: (n: number) => string;
}) {
  const unlimited = limit === -1;
  const pct = unlimited ? 0 : Math.min(100, Math.round((current / limit) * 100));
  const barColor =
    pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          {formatValue(current)}
          {!unlimited && ` / ${formatValue(limit)}`}
          {unlimited && " (unlimited)"}
        </span>
      </div>
      {!unlimited && (
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div
            className={`h-1.5 rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function BillingTab({ tier, limits, usage, hasStripeCustomer }: BillingTabProps) {
  const [plansOpen, setPlansOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setPortalLoading(false);
    }
  }

  const tierLabel = tier === "FREE" ? "Free" : tier === "PRO" ? "Pro" : "Enterprise";

  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
                  Current plan
                </CardTitle>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-2xl font-bold">{tierLabel}</span>
                  <Badge variant="secondary" className="text-xs">Active</Badge>
                </div>
              </div>
              <div className="flex gap-2">
                {tier !== "FREE" && hasStripeCustomer && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManageBilling}
                    disabled={portalLoading}
                  >
                    {portalLoading ? "Loading..." : "Manage billing"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPlansOpen(true)}
                >
                  View plans
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 border-t pt-4">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              This month
            </p>
            <UsageMeter
              label="Operations"
              current={usage.operationCount}
              limit={limits.monthlyOperations}
              formatValue={(n) => n.toLocaleString()}
            />
            <UsageMeter
              label="Connections"
              current={usage.connectionCount}
              limit={limits.maxConnections}
              formatValue={(n) => n.toString()}
            />
            <UsageMeter
              label="Uploaded"
              current={usage.uploadBytes}
              limit={-1}
              formatValue={formatBytes}
            />
            <UsageMeter
              label="Downloaded"
              current={usage.downloadBytes}
              limit={-1}
              formatValue={formatBytes}
            />
          </CardContent>
        </Card>

        {usage.connectionCount >= limits.maxConnections && limits.maxConnections !== -1 && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-amber-600 dark:text-amber-400">
            You&apos;ve used all {limits.maxConnections} connections.{" "}
            <button
              className="underline hover:no-underline"
              onClick={() => setPlansOpen(true)}
            >
              Upgrade to PRO
            </button>{" "}
            to add up to 10.
          </div>
        )}
      </div>

      <PlansModal open={plansOpen} onOpenChange={setPlansOpen} />
    </>
  );
}
```

- [ ] **Step 2: Create the billing settings page**

```tsx
// src/app/(dashboard)/settings/billing/page.tsx
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
```

- [ ] **Step 3: Add Billing link to sidebar navigation**

In `src/components/shared/app-sidebar.tsx`, find where the Settings link is rendered (around `href="/settings"`) and add a Billing link alongside or beneath it:

```tsx
import { CreditCard } from "lucide-react";

// Near the Settings link:
<Link
  href="/settings/billing"
  className={cn(
    "...", // match existing Settings link styling
    pathname === "/settings/billing" && "...", // active state
  )}
>
  <CreditCard className="h-4 w-4" />
  Billing
</Link>
```

> **Note:** Match the exact className pattern of the adjacent Settings link for consistent styling.

- [ ] **Step 4: Commit**

```bash
git add src/components/billing/billing-tab.tsx src/components/billing/plans-modal.tsx \
        src/app/\(dashboard\)/settings/billing/page.tsx \
        src/components/shared/app-sidebar.tsx
git commit -m "feat: add billing settings page with usage meters and plan card"
```

---

## Self-Review Checklist

After all tasks are complete, verify:

- [ ] `pnpm build` completes without TypeScript errors
- [ ] `pnpm vitest run` — all tests pass (tiers, gates, webhook handler)
- [ ] Sign in as a FREE user → Shares and Teams pages show the locked overlay
- [ ] Shares and Teams sidebar items show the "PRO" badge
- [ ] `POST /api/share-links` with a FREE user returns 403
- [ ] `POST /api/teams` with a FREE user returns 403
- [ ] Activity API returns only entries within the 30-day retention window for FREE users
- [ ] `/settings/billing` loads with usage meters and "View plans" button
- [ ] "View plans" opens the 3-column plans modal
- [ ] "Upgrade to PRO" in the modal calls checkout API and gets a redirect URL (requires `STRIPE_PRO_PRICE_ID` set)
- [ ] Stripe webhook endpoint is registered in Stripe Dashboard pointing at `/api/webhooks/stripe`
