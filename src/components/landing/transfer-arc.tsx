"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react";
import { Reveal } from "./primitives/reveal";
import { useReducedMotionSafe } from "./primitives/use-reduced-motion-safe";
import { AppWindow } from "./mocks/app-window";
import { FileGrid } from "./mocks/file-grid";

const ARC_D = "M 150 70 C 420 40, 420 350, 650 320";

export function TransferArc() {
  const ref = useRef<HTMLElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const reduced = useReducedMotionSafe();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  // map the middle 60% of the section's viewport transit onto the arc
  const arcProgress = useTransform(scrollYProgress, [0.25, 0.75], [0, 1], {
    clamp: true,
  });

  const cx = useMotionValue(150);
  const cy = useMotionValue(70);

  useMotionValueEvent(arcProgress, "change", (value) => {
    const path = pathRef.current;
    // getPointAtLength is unavailable in jsdom and very old browsers
    if (!path || typeof path.getTotalLength !== "function") return;
    const point = path.getPointAtLength(value * path.getTotalLength());
    cx.set(point.x);
    cy.set(point.y);
  });

  return (
    <section ref={ref} className="relative overflow-hidden px-6 py-32">
      <Reveal className="mx-auto mb-16 max-w-3xl">
        <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Move files between any two buckets.
        </h2>
        <p className="mt-4 text-lg text-[var(--landing-muted)]">
          Across accounts, across providers, across regions. Drag in one window,
          drop in another.
        </p>
      </Reveal>

      <div className="relative mx-auto max-w-5xl">
        {/* the arc, desktop only */}
        <svg
          viewBox="0 0 800 420"
          fill="none"
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 hidden h-full w-full md:block"
        >
          <defs>
            <linearGradient id="arc-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--accent-amber)" stopOpacity="0.1" />
              <stop offset="100%" stopColor="var(--accent-amber)" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <path d={ARC_D} stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
          <motion.path
            ref={pathRef}
            d={ARC_D}
            stroke="url(#arc-gradient)"
            strokeWidth="2"
            style={reduced ? undefined : { pathLength: arcProgress }}
          />
          {!reduced && (
            <motion.circle
              cx={cx}
              cy={cy}
              r="6"
              fill="var(--accent-amber)"
              style={{ filter: "drop-shadow(0 0 8px var(--accent-amber))" }}
            />
          )}
        </svg>

        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-24">
          <AppWindow title="prod · AWS us-east-1" className="md:mb-32">
            <FileGrid
              items={[
                { name: "release-v2.zip", kind: "archive", highlighted: true },
                { name: "assets", kind: "folder" },
                { name: "config.json", kind: "doc" },
              ]}
              className="grid-cols-3"
            />
          </AppWindow>
          <AppWindow title="backup · Cloudflare R2" className="md:mt-32">
            <FileGrid
              items={[
                { name: "archive-2025", kind: "folder" },
                { name: "archive-2026", kind: "folder" },
                { name: "release-v1.zip", kind: "archive" },
              ]}
              className="grid-cols-3"
            />
          </AppWindow>
        </div>
      </div>
    </section>
  );
}
