import Link from "next/link";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_DISPLAYS } from "@/lib/subscriptions/plan-display";
import { Reveal } from "./primitives/reveal";

const FAQS = [
  {
    q: "Do you store my files?",
    a: "No. Your files stay in your buckets — S3 Dock talks directly to your S3 endpoint. We store connection metadata and your credentials, encrypted at rest.",
  },
  {
    q: "Which providers work?",
    a: "Anything that speaks the S3 protocol: AWS S3, Cloudflare R2, MinIO, Backblaze B2, DigitalOcean Spaces, Wasabi, Ceph, and more.",
  },
  {
    q: "Is my data secure?",
    a: "Credentials are encrypted at rest, all traffic runs over HTTPS, and secret keys are never returned by our API after you save them.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Downgrade or cancel from the billing page whenever you like — your connections and settings stay put.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes — two connections and 1,000 operations a month, free forever. No credit card required.",
  },
];

function PlanCta({ planId }: { planId: string }) {
  if (planId === "enterprise") {
    return (
      <a
        href="mailto:hello@s3dock.app"
        className="mt-6 block rounded-lg border border-white/15 py-2 text-center text-sm text-white/80 transition-colors hover:border-white/30"
      >
        Contact us
      </a>
    );
  }
  return (
    <Link
      href="/sign-up"
      className={cn(
        "mt-6 block rounded-lg py-2 text-center text-sm font-semibold transition-opacity hover:opacity-90",
        planId === "pro"
          ? "bg-[var(--accent-amber)] text-black"
          : "border border-white/15 text-white/80"
      )}
    >
      Get started
    </Link>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="px-6 py-32">
      <Reveal className="mx-auto mb-16 max-w-3xl text-center">
        <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Simple pricing. No surprises.
        </h2>
        <p className="mt-4 text-lg text-[var(--landing-muted)]">
          Start free. Upgrade when your storage outgrows you.
        </p>
      </Reveal>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-3">
        {PLAN_DISPLAYS.map((plan, i) => (
          <Reveal key={plan.id} delay={i * 0.1}>
            <div
              className={cn(
                "relative h-full rounded-2xl border p-6",
                plan.highlighted
                  ? "border-[var(--accent-amber)]/50 bg-[var(--accent-amber)]/5 shadow-[0_0_50px_var(--accent-amber-glow)] md:-translate-y-2"
                  : "border-white/10 bg-white/[0.02]"
              )}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--accent-amber)] px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
                  Most popular
                </span>
              )}
              <p
                className={cn(
                  "text-xs font-medium uppercase tracking-widest",
                  plan.highlighted ? "text-[var(--accent-amber)]" : "text-white/40"
                )}
              >
                {plan.name}
              </p>
              <p className="mt-2 text-3xl font-bold text-white">{plan.price}</p>
              <p className="text-xs text-white/40">{plan.period || " "}</p>
              <div className="mt-5 space-y-2 border-t border-white/10 pt-5">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm text-white/70">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--accent-amber)]" />
                    {feature}
                  </div>
                ))}
                {(plan.missing ?? []).map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm text-white/30">
                    <X className="mt-0.5 size-3.5 shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>
              <PlanCta planId={plan.id} />
            </div>
          </Reveal>
        ))}
      </div>

      <div className="mx-auto mt-24 max-w-2xl">
        <Reveal>
          <h3 className="mb-6 text-center text-2xl font-semibold text-white">
            Questions, answered.
          </h3>
        </Reveal>
        <div className="space-y-2">
          {FAQS.map((faq) => (
            <Reveal key={faq.q}>
              <details className="group rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-white/90 [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <span className="text-white/40 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[var(--landing-muted)]">
                  {faq.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
