"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from "motion/react";
import { cn } from "@/lib/utils";
import { getBeat } from "@/lib/landing/scroll-beats";
import { useReducedMotionSafe } from "./primitives/use-reduced-motion-safe";
import { AppWindow } from "./mocks/app-window";
import { FileGrid, type FileItem } from "./mocks/file-grid";
import { CommandPaletteMock } from "./mocks/command-palette-mock";

const BROWSE_FILES: FileItem[] = [
  { name: "campaigns", kind: "folder" },
  { name: "logos", kind: "folder" },
  { name: "team-photo.jpg", kind: "image" },
  { name: "brand.pdf", kind: "doc" },
  { name: "icons.zip", kind: "archive" },
  { name: "promo.mp4", kind: "video" },
  { name: "summary.md", kind: "doc" },
  { name: "banner.png", kind: "image" },
];

function BrowseScene() {
  return (
    <div>
      <div className="border-b border-white/5 px-4 py-2 font-mono text-xs text-white/40">
        Home <span className="text-white/20">/</span> marketing{" "}
        <span className="text-white/20">/</span>{" "}
        <span className="text-white/70">assets</span>
      </div>
      <FileGrid items={BROWSE_FILES} />
    </div>
  );
}

function DragScene({ animated = true }: { animated?: boolean }) {
  return (
    <div className="relative">
      <div className="border-b border-white/5 px-4 py-2 font-mono text-xs text-white/40">
        Home <span className="text-white/20">/</span>{" "}
        <span className="text-white/70">uploads</span>
      </div>
      <FileGrid
        items={[
          { name: "uploads", kind: "folder" },
          { name: "site.zip", kind: "archive", highlighted: true },
          { name: "v2.zip", kind: "archive" },
          { name: "readme.md", kind: "doc" },
        ]}
      />
      {animated && (
        <motion.div
          animate={{ x: [0, 110, 110], y: [0, 40, 40], opacity: [1, 1, 0] }}
          transition={{ duration: 3, repeat: Infinity, times: [0.25, 0.7, 0.95] }}
          className="absolute left-8 top-16 z-10 rounded-md border border-[var(--accent-amber)]/50 bg-[var(--accent-amber)]/20 px-2 py-1 font-mono text-[10px] text-[var(--accent-amber)]"
        >
          deploy.tar.gz
        </motion.div>
      )}
      <div className="absolute bottom-3 right-3 rounded-lg border border-white/10 bg-black/80 px-3 py-2 font-mono text-[11px] text-white/70 shadow-xl">
        Uploading 3 files… <span className="text-green-400">✓</span>
      </div>
    </div>
  );
}

function SearchScene() {
  return (
    <div className="flex items-center justify-center p-6">
      <CommandPaletteMock
        className="w-full max-w-md"
        scenes={[
          {
            query: "photos from launch",
            results: [
              "marketing/launch/team-photo.jpg",
              "marketing/launch/stage.png",
              "archive/launch-2025/crowd.jpg",
            ],
          },
        ]}
      />
    </div>
  );
}

interface Beat {
  title: string;
  body: string;
  Scene: (props: { animated?: boolean }) => ReactNode;
}

const BEATS: Beat[] = [
  {
    title: "Folders, not prefixes.",
    body: "Navigate buckets the way you navigate your laptop — breadcrumbs, folders, and a grid of files. No key-prefix mental gymnastics.",
    Scene: BrowseScene,
  },
  {
    title: "Drag, don't aws s3 cp.",
    body: "Upload, move, and reorganize with your mouse. Progress lives in a toast, not a terminal scrollback.",
    Scene: DragScene,
  },
  {
    title: "Search like you mean it.",
    body: "Hit ⌘K and find any file across every bucket you've connected. Indexed, instant, everywhere.",
    Scene: SearchScene,
  },
];

/** Static fallback for reduced motion: all beats visible, no pinning. */
function StaticBeats() {
  return (
    <section className="px-6 py-32">
      <div className="mx-auto max-w-6xl space-y-20">
        {BEATS.map((beat) => {
          const Scene = beat.Scene;
          return (
          <div
            key={beat.title}
            className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.4fr_1fr]"
          >
            <AppWindow title="s3dock.com"><Scene animated={false} /></AppWindow>
            <div>
              <h3 className="text-2xl font-semibold tracking-tight text-white">
                {beat.title}
              </h3>
              <p className="mt-3 text-[var(--landing-muted)]">{beat.body}</p>
            </div>
          </div>
          );
        })}
      </div>
    </section>
  );
}

export function MetaphorReveal() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotionSafe();
  const [beat, setBeat] = useState(0);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    setBeat(getBeat(value, BEATS.length).index);
  });

  if (reduced) {
    return <StaticBeats />;
  }

  const ActiveScene = BEATS[beat].Scene;

  return (
    <section ref={ref} className="relative h-[250svh]">
      <div className="sticky top-0 flex h-svh items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 lg:grid-cols-[1.4fr_1fr]">
          <AppWindow title="s3dock.com">
            <AnimatePresence mode="wait">
              <motion.div
                key={beat}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35 }}
              >
                <ActiveScene />
              </motion.div>
            </AnimatePresence>
          </AppWindow>

          <div className="hidden space-y-12 lg:block">
            {BEATS.map((b, i) => (
              <div
                key={b.title}
                className={cn(
                  "transition-opacity duration-300",
                  i === beat ? "opacity-100" : "opacity-30"
                )}
              >
                <h3 className="text-2xl font-semibold tracking-tight text-white">
                  {b.title}
                </h3>
                <p className="mt-3 text-[var(--landing-muted)]">{b.body}</p>
              </div>
            ))}
          </div>

          {/* mobile: show only the active beat's text below the window */}
          <div className="lg:hidden">
            <h3 className="text-2xl font-semibold tracking-tight text-white">
              {BEATS[beat].title}
            </h3>
            <p className="mt-3 text-[var(--landing-muted)]">{BEATS[beat].body}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
