"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { Glow } from "./primitives/glow";
import { GridBg } from "./primitives/grid-bg";
import { AppWindow } from "./mocks/app-window";
import { FileGrid, type FileItem } from "./mocks/file-grid";
import { VideoModal } from "./video-modal";
import { useReducedMotionSafe } from "./primitives/use-reduced-motion-safe";

const HEADLINE = ["S3,", "finally", "usable."];

const HERO_FILES: FileItem[] = [
  { name: "design-assets", kind: "folder" },
  { name: "backups", kind: "folder" },
  { name: "hero.png", kind: "image", highlighted: true },
  { name: "report-q2.pdf", kind: "doc" },
  { name: "archive.zip", kind: "archive" },
  { name: "launch.mp4", kind: "video" },
  { name: "notes.md", kind: "doc" },
  { name: "favicon.svg", kind: "image" },
];

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const reduced = useReducedMotionSafe();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const tileY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const tileScale = useTransform(scrollYProgress, [0, 1], [1, 0.94]);

  return (
    <section
      ref={ref}
      className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 pb-16 pt-28"
    >
      <GridBg />
      <Glow className="left-1/2 top-0 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/3" />

      <div className="relative z-10 flex max-w-3xl flex-col items-center text-center">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-xs text-white/60"
        >
          <span className="size-1.5 rounded-full bg-[var(--accent-amber)] shadow-[0_0_8px_var(--accent-amber)]" />
          Now in beta
        </motion.div>

        <h1 className="mt-6 text-5xl font-semibold tracking-[-0.03em] text-white sm:text-6xl md:text-7xl">
          {HEADLINE.map((word, i) => (
            <motion.span
              key={word}
              className="inline-block"
              initial={reduced ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.15 + i * 0.12,
                ease: [0.21, 0.47, 0.32, 0.98],
              }}
            >
              {word}
              {i < HEADLINE.length - 1 ? " " : ""}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-5 max-w-xl text-balance text-lg text-[var(--landing-muted)]"
        >
          A modern web UI for S3, R2, MinIO, and anything else that speaks the
          protocol. Browse, search, and move files like it&apos;s a drive.
        </motion.p>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.62 }}
          className="mt-8 flex items-center gap-3"
        >
          <button
            onClick={() => setVideoOpen(true)}
            className="flex items-center gap-2 rounded-full bg-[var(--accent-amber)] px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            <Play className="size-4" />
            Watch the demo
          </button>
          <Link
            href="/sign-up"
            className="flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/80 transition-colors hover:border-white/30 hover:text-white"
          >
            Try free
            <ArrowRight className="size-4" />
          </Link>
        </motion.div>
      </div>

      <motion.div
        initial={reduced ? false : { opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.75 }}
        style={reduced ? undefined : { y: tileY, scale: tileScale }}
        className="relative z-10 mt-14 w-full max-w-4xl"
      >
        <button
          onClick={() => setVideoOpen(true)}
          aria-label="Play the S3 Dock demo video"
          className="group relative block w-full cursor-pointer text-left"
        >
          <AppWindow
            title="s3dock.app — demo"
            className="shadow-[0_40px_120px_var(--accent-amber-glow)]"
          >
            <div className="relative">
              <FileGrid items={HERO_FILES} className="py-6 opacity-80" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/20">
                <span className="flex size-16 items-center justify-center rounded-full bg-white/95 text-black shadow-xl transition-transform group-hover:scale-110">
                  <Play className="ml-1 size-6" />
                </span>
              </div>
            </div>
          </AppWindow>
        </button>
      </motion.div>

      <VideoModal open={videoOpen} onOpenChange={setVideoOpen} />
    </section>
  );
}
