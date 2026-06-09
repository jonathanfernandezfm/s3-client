/**
 * Display copy for subscription plans, shared by the landing page pricing
 * section and the in-app upgrade modal. Limits themselves are enforced by
 * tiers.ts — this file is presentation only.
 */
export interface PlanDisplay {
  id: "free" | "pro" | "enterprise";
  name: string;
  price: string;
  period: string;
  features: readonly string[];
  /** Features intentionally absent from this plan (shown struck-through). */
  missing?: readonly string[];
  /** The recommended plan gets highlighted treatment. */
  highlighted?: boolean;
}

export const PLAN_DISPLAYS: readonly PlanDisplay[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    features: [
      "2 connections",
      "50 MB file uploads",
      "1,000 operations/month",
      "File notes",
      "30-day activity history",
    ],
    missing: ["Share links", "Teams"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$4",
    period: "per month",
    highlighted: true,
    features: [
      "10 connections",
      "Unlimited file uploads",
      "50,000 operations/month",
      "Share links (password, expiry, analytics)",
      "1 team · 5 members",
      "90-day activity history",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: [
      "Unlimited connections",
      "Unlimited uploads",
      "All PRO features",
      "Unlimited teams",
      "Unlimited activity history",
      "Priority support + SLA",
    ],
  },
];
