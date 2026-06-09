"use client";

import { useRef } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { Copy, Link2, Shield, Users } from "lucide-react";
import { Reveal } from "./primitives/reveal";
import { useLoop } from "./primitives/use-loop";

function ShareLinkCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white">
        <Link2 className="size-4 text-[var(--accent-amber)]" /> Share link
      </div>
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2">
        <span className="truncate font-mono text-xs text-white/60">
          s3dock.app/s/q2-report-x7f2
        </span>
        <Copy className="size-3.5 shrink-0 text-white/40" />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-white/50">
        <span>Expires in 7 days</span>
        <span className="rounded-full bg-[var(--accent-amber)]/15 px-2 py-0.5 font-mono text-[10px] text-[var(--accent-amber)]">
          password protected
        </span>
      </div>
    </div>
  );
}

function TeamMembersCard() {
  const members = [
    ["AM", "Ana M.", "Owner"],
    ["JK", "Jonas K.", "Editor"],
    ["RD", "Rita D.", "Viewer"],
  ] as const;
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white">
        <Users className="size-4 text-[var(--accent-amber)]" /> Team
      </div>
      <div className="space-y-2.5">
        {members.map(([initials, name, role]) => (
          <div key={name} className="flex items-center gap-3">
            <span className="flex size-7 items-center justify-center rounded-full bg-white/10 font-mono text-[10px] text-white/70">
              {initials}
            </span>
            <span className="flex-1 text-sm text-white/70">{name}</span>
            <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-white/40">
              {role}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PermissionsCard() {
  const rules = [
    ["prod-assets", "read-only"],
    ["user-uploads", "read & write"],
    ["backups", "no access"],
  ] as const;
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white">
        <Shield className="size-4 text-[var(--accent-amber)]" /> Permissions
      </div>
      <div className="space-y-2.5">
        {rules.map(([bucket, access]) => (
          <div key={bucket} className="flex items-center justify-between">
            <span className="font-mono text-xs text-white/60">{bucket}</span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] text-white/50">
              {access}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CARDS = [
  { id: "share", node: <ShareLinkCard /> },
  { id: "team", node: <TeamMembersCard /> },
  { id: "permissions", node: <PermissionsCard /> },
];

export function Teams() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px" });
  const active = useLoop(CARDS.length, 3500, inView);

  return (
    <section className="px-6 py-32">
      <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-14 md:grid-cols-2">
        <Reveal>
          <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Storage your whole team can actually use.
          </h2>
          <p className="mt-5 text-lg text-[var(--landing-muted)]">
            Share links, granular permissions, and team workspaces — without
            handing out AWS keys.
          </p>
        </Reveal>

        <div ref={ref} className="relative mx-auto w-full max-w-sm" style={{ perspective: 1000 }}>
          {/* static ghost cards behind the active one for the stacked look */}
          <div
            aria-hidden
            className="absolute inset-x-4 -top-3 h-full rounded-2xl border border-white/5 bg-white/[0.02]"
          />
          <div
            aria-hidden
            className="absolute inset-x-2 -top-1.5 h-full rounded-2xl border border-white/5 bg-white/[0.02]"
          />
          <AnimatePresence mode="wait">
            <motion.div
              key={CARDS[active].id}
              initial={{ opacity: 0, y: 16, rotateX: -8 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.45 }}
              className="relative"
            >
              {CARDS[active].node}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
