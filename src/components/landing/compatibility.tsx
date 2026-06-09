"use client";

import { useRef } from "react";
import { useInView } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "./primitives/reveal";
import { useLoop } from "./primitives/use-loop";

const PROVIDERS = [
  "AWS S3",
  "Cloudflare R2",
  "MinIO",
  "Backblaze B2",
  "DigitalOcean Spaces",
  "Wasabi",
  "Ceph",
];

/** Auto-filling 3-field connection form: empty → filled → connected. */
function ConnectDemo({ active }: { active: boolean }) {
  const step = useLoop(3, 1600, active);

  const fields = [
    ["Endpoint", "https://s3.us-east-1.amazonaws.com"],
    ["Access key", "AKIA••••••••EXAMPLE"],
    ["Secret key", "••••••••••••••••"],
  ] as const;

  return (
    <div className="mx-auto mt-12 w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d0d0d] p-5">
      <p className="mb-4 font-mono text-xs text-white/40">New connection</p>
      <div className="space-y-3">
        {fields.map(([label, value]) => (
          <div key={label}>
            <p className="mb-1 text-[11px] text-white/40">{label}</p>
            <div className="flex h-9 items-center rounded-lg border border-white/10 bg-black/40 px-3 font-mono text-xs text-white/70">
              {step >= 1 ? value : ""}
            </div>
          </div>
        ))}
      </div>
      <div
        className={cn(
          "mt-4 flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors duration-300",
          step === 2
            ? "bg-green-500/15 text-green-400"
            : "bg-[var(--accent-amber)] text-black"
        )}
      >
        {step === 2 ? (
          <>
            <Check className="size-4" /> Connected
          </>
        ) : (
          "Connect"
        )}
      </div>
    </div>
  );
}

export function Compatibility() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px" });

  return (
    <section className="overflow-hidden px-6 py-32">
      <Reveal className="mx-auto mb-12 max-w-3xl text-center">
        <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
          One client. Every S3.
        </h2>
        <p className="mt-4 text-lg text-[var(--landing-muted)]">
          If it speaks the S3 protocol, S3 Dock connects to it. Setup takes about
          thirty seconds.
        </p>
      </Reveal>

      <div className="marquee-group relative mx-auto max-w-5xl" ref={ref}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[var(--landing-bg)] to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[var(--landing-bg)] to-transparent"
        />
        <div className="animate-marquee flex w-max gap-3">
          {[...PROVIDERS, ...PROVIDERS].map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 font-mono text-sm text-white/60"
            >
              {name}
            </span>
          ))}
          <span className="rounded-full border border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10 px-5 py-2.5 font-mono text-sm text-[var(--accent-amber)]">
            + any S3-compatible endpoint
          </span>
        </div>
      </div>

      <Reveal delay={0.15}>
        <ConnectDemo active={inView} />
      </Reveal>
    </section>
  );
}
