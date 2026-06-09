"use client";

import { motion } from "motion/react";
import { Parallax } from "./primitives/parallax";
import { Reveal } from "./primitives/reveal";
import { AppWindow } from "./mocks/app-window";
import { FileGrid, type FileItem } from "./mocks/file-grid";

const DOCK_FILES: FileItem[] = [
  { name: "assets", kind: "folder" },
  { name: "uploads", kind: "folder" },
  { name: "banner.png", kind: "image" },
  { name: "invoice.pdf", kind: "doc" },
  { name: "build.zip", kind: "archive" },
  { name: "promo.mp4", kind: "video" },
];

/** Desaturated, dense AWS-console caricature (left half of the split). */
function ConsoleMock() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#141414] p-4 opacity-60 saturate-50">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-5 w-36 rounded bg-white/10" />
        <div className="h-5 w-20 rounded bg-white/10" />
        <div className="h-5 w-24 rounded bg-white/10" />
      </div>
      <div className="mb-3 flex gap-2">
        <div className="h-7 flex-1 rounded border border-white/10 bg-white/5" />
        <div className="h-7 w-20 rounded bg-white/10" />
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="size-3 rounded-sm border border-white/20" />
            <div className="h-3 flex-1 rounded bg-white/10" />
            <div className="h-3 w-16 rounded bg-white/5" />
            <div className="h-3 w-12 rounded bg-white/5" />
            <div className="h-3 w-14 rounded bg-white/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProblemSplit() {
  return (
    <section className="relative overflow-hidden px-6 py-32">
      <Reveal className="mx-auto mb-16 max-w-3xl">
        <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
          The AWS console wasn&apos;t built for humans.
        </h2>
        <p className="mt-4 text-lg text-[var(--landing-muted)]">We built one that was.</p>
      </Reveal>

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 md:grid-cols-2">
        {/* animated divider, desktop only */}
        <motion.div
          aria-hidden
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute left-1/2 top-0 hidden h-full w-px origin-top rotate-3 bg-gradient-to-b from-transparent via-[var(--accent-amber)]/50 to-transparent md:block"
        />

        <Parallax speed={30}>
          <span className="mb-3 inline-block rounded-full border border-white/15 px-3 py-1 font-mono text-xs text-white/40">
            S3 console
          </span>
          <ConsoleMock />
        </Parallax>

        <Parallax speed={-30}>
          <span className="mb-3 inline-block rounded-full border border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10 px-3 py-1 font-mono text-xs text-[var(--accent-amber)]">
            S3 Dock
          </span>
          <AppWindow title="my-bucket / assets">
            <div className="border-b border-white/5 px-4 py-2 font-mono text-xs text-white/40">
              Home <span className="text-white/20">/</span> my-bucket{" "}
              <span className="text-white/20">/</span>{" "}
              <span className="text-white/70">assets</span>
            </div>
            <FileGrid items={DOCK_FILES} />
          </AppWindow>
        </Parallax>
      </div>
    </section>
  );
}
