# Plan 058: Produce a ~20s looping Remotion demo video for the landing page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat e9ad3b3..HEAD -- src/components/landing public/demo src/app/globals.css`
> If any of those changed since this plan was written, compare the "Current
> state" excerpts below against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (new toolchain — Remotion — added to the repo; no app/runtime code changes)
- **Depends on**: none
- **Category**: dx / direction (marketing asset)
- **Planned at**: commit `e9ad3b3`, 2026-06-28

## Why this matters

The landing page already ships a `VideoModal` (`src/components/landing/video-modal.tsx`)
that tries to play `/demo/showcase.webm`, `/demo/showcase.mp4`, and poster
`/demo/poster.png`. Those assets do not exist yet, so the modal renders its
"Demo video coming soon." fallback. This plan produces those exact files with a
polished, brand-matched, **silent + kinetic-caption** demo built in
[Remotion](https://www.remotion.dev/) (programmatic React video). The result is
a ~20-second loop showing the product's marquee moments (browse → search → drag
across buckets → CTA), rendered deterministically with smooth spring
transitions — no live database, Clerk, or S3 fixtures required.

Decisions already made by the product owner for this work:
- **Approach**: synthetic Remotion scenes that reuse the existing brand + the
  pure presentational mock components, *not* screen recordings.
- **Length/depth**: ~20s loop, 3–4 marquee moments plus intro/outro bookends.
- **Audio**: none — animated on-screen captions carry the story (plays well
  muted/autoplay).

## Current state

### The consumer of the assets you will produce

`src/components/landing/video-modal.tsx` (verbatim, lines 36–46):

```tsx
            <video
              className="aspect-video w-full"
              poster="/demo/poster.png"
              controls
              autoPlay
              onError={() => setFailed(true)}
            >
              <source src="/demo/showcase.webm" type="video/webm" />
              <source src="/demo/showcase.mp4" type="video/mp4" />
            </video>
```

So your render targets are exactly: `public/demo/showcase.webm`,
`public/demo/showcase.mp4`, `public/demo/poster.png`. Do not rename them.
**You will not modify `video-modal.tsx` or any app code** — only add the
Remotion project and the three output files.

### Brand / design tokens (must match)

From `src/app/globals.css` (verbatim, lines 227–230):

```css
	--accent-amber: oklch(0.83 0.16 85);
	--accent-amber-glow: oklch(0.83 0.16 85 / 0.25);
	--landing-bg: oklch(0.12 0 0);
	--landing-muted: oklch(0.7 0 0);
```

- Fonts (from `src/app/layout.tsx`): **Space Grotesk** (sans, headings/body),
  **Geist Mono** (mono, file names / paths / kbd).
- Visual language across the landing mocks: near-black background
  (`--landing-bg` ≈ `#0d0d0d`/`#101010` panels), white text at low opacity
  (`text-white/40`–`/80`), amber accent for highlights/glows, macOS
  traffic-light window chrome, mono for any path/filename.
- Headline of the product: **"S3, finally usable."** Tagline: "A modern web UI
  for S3, R2, MinIO, and anything else that speaks the protocol." Domain shown
  in mocks: **s3dock.com**.

### Reusable, Remotion-safe components (import these directly)

These two are **pure** (no `"use client"`, no hooks, no wall-clock timers) and
safe to render inside Remotion. Reuse them so the video matches the real app:

- `src/components/landing/mocks/app-window.tsx` → `AppWindow` — faux browser
  chrome (traffic lights + title + optional tabs/sidebar). Pure; imports only
  `cn` from `@/lib/utils` and `ReactNode`.
- `src/components/landing/mocks/file-grid.tsx` → `FileGrid` / `FileItem` /
  `FileKind` — grid of file tiles with lucide icons. Pure; imports `cn` +
  `lucide-react`. `FileItem = { name; kind: "folder"|"image"|"doc"|"archive"|"video"; highlighted? }`.

`cn` (`src/lib/utils.ts`) is just `twMerge(clsx(...))` — pure, safe.

### NOT Remotion-safe (do not import — reimplement frame-driven instead)

- `src/components/landing/mocks/command-palette-mock.tsx` (`CommandPaletteMock`)
  — uses `useState`/`useEffect`/`setInterval` to type on wall-clock time.
  Remotion drives time via `useCurrentFrame()`, so this would not animate in a
  render. You will build a frame-driven `SearchPalette` instead (Step 5), using
  this file only as a **visual reference** for layout/styling.
- Anything under `src/components/landing/` that imports from `motion/react`
  (e.g. `hero.tsx`, `feature-bento.tsx`, `primitives/*`). Use them as **style
  reference only**; never import them into Remotion (Framer Motion animations
  are wall-clock-driven and will not render frame-accurately).

### Repo facts

- Package manager: **pnpm**. Framework: Next.js 16 (App Router) + React 19 +
  TypeScript (strict) + Tailwind CSS v4. Remotion v4 supports React 19.
- Path alias: `@/*` → `./src/*` (works in Remotion's bundler too — see Step 2).
- Remotion runs its **own webpack bundler**, fully independent of Next's
  Turbopack build, so adding it does not change how the app builds or deploys.
- `tsconfig.json` includes `**/*.ts(x)`, so your new `src/remotion/**` files
  **and** root `remotion.config.ts` are type-checked by `pnpm typecheck` and by
  `next build`. They must compile cleanly.
- No Remotion packages are installed yet (verified at `e9ad3b3`).

## Commands you will need

| Purpose            | Command                                   | Expected on success            |
|--------------------|-------------------------------------------|--------------------------------|
| Install deps       | `pnpm install`                            | exit 0                         |
| Add Remotion deps  | `pnpm add remotion @remotion/cli @remotion/transitions @remotion/google-fonts @remotion/tailwind-v4` | exit 0, packages added |
| Typecheck          | `pnpm typecheck`                          | exit 0, no errors              |
| Lint               | `pnpm lint`                               | exit 0                         |
| Preview (manual)   | `pnpm video:studio`                       | opens Remotion Studio in browser |
| Render mp4         | `pnpm video:render`                       | writes `public/demo/showcase.mp4` |
| Render webm        | `pnpm video:render:webm`                  | writes `public/demo/showcase.webm` |
| Render poster      | `pnpm video:poster`                       | writes `public/demo/poster.png` |
| App still builds   | `pnpm build`                              | exit 0 (Next ignores Remotion) |

> First render downloads a headless Chrome shell (~150 MB) automatically; this
> is normal and only happens once. It requires network access.

## Suggested executor toolkit

- Remotion fundamentals you must respect (read if unsure):
  - Animation is a pure function of `useCurrentFrame()` — never `setTimeout`,
    `Date.now()`, `Math.random()` at render time, or CSS keyframe/transition
    animations. Use `interpolate()` and `spring()` from `remotion`.
  - `@remotion/transitions` `TransitionSeries` for scene-to-scene transitions.
  - Docs: https://www.remotion.dev/docs/the-fundamentals ,
    https://www.remotion.dev/docs/transitions , Tailwind v4:
    https://www.remotion.dev/docs/tailwind/tailwind .
- If available, use the `frontend-design` skill when composing the scene visuals
  to keep them distinctive rather than generic.

## Scope

**In scope** (create these; do not touch anything else):

- `remotion.config.ts` (repo root, create)
- `src/remotion/index.ts` (create — `registerRoot` entry)
- `src/remotion/Root.tsx` (create — registers the composition)
- `src/remotion/styles.css` (create — Tailwind import + design tokens)
- `src/remotion/fonts.ts` (create — font loading)
- `src/remotion/theme.ts` (create — shared color/timing constants)
- `src/remotion/ShowcaseDemo.tsx` (create — assembles scenes via TransitionSeries)
- `src/remotion/scenes/IntroScene.tsx` (create)
- `src/remotion/scenes/BrowseScene.tsx` (create)
- `src/remotion/scenes/SearchScene.tsx` (create)
- `src/remotion/scenes/DragScene.tsx` (create)
- `src/remotion/scenes/OutroScene.tsx` (create)
- `src/remotion/components/GridBackdrop.tsx` (create)
- `src/remotion/components/Caption.tsx` (create)
- `src/remotion/components/Cursor.tsx` (create)
- `src/remotion/components/SearchPalette.tsx` (create)
- `src/remotion/components/DragFile.tsx` (create)
- `src/remotion/components/BrandLockup.tsx` (create)
- `package.json` (add the four `video:*` scripts + the deps — via `pnpm add`)
- `public/demo/showcase.mp4`, `public/demo/showcase.webm`, `public/demo/poster.png` (rendered outputs)

**Out of scope** (do NOT modify, even though related):

- `src/components/landing/video-modal.tsx` and any other app/route code — the
  modal already points at the correct paths; the app needs zero changes.
- The pure mock components `app-window.tsx` / `file-grid.tsx` — **import** them,
  never edit them (other landing sections depend on them).
- `next.config.ts`, `tailwind`/`postcss` config for the Next app — Remotion uses
  its own bundler config in `remotion.config.ts`; do not retarget the app's
  build.
- Any `motion/react`-based landing component.

## Git workflow

- Branch: `advisor/058-remotion-demo-video` (matches the repo's `advisor/NNN-slug`
  convention seen in `plans/README.md`).
- Commit style: conventional commits (repo uses `feat:` / `fix:` — see
  `git log`). Suggested: `feat: add Remotion demo video project and rendered assets`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Install Remotion and add render scripts

Run:

```
pnpm add remotion @remotion/cli @remotion/transitions @remotion/google-fonts @remotion/tailwind-v4
```

Then add these scripts to the `"scripts"` block of `package.json` (keep existing
scripts; the entry id `ShowcaseDemo` must match the composition id you register
in Step 8):

```json
    "video:studio": "remotion studio src/remotion/index.ts",
    "video:render": "remotion render src/remotion/index.ts ShowcaseDemo public/demo/showcase.mp4 --codec=h264",
    "video:render:webm": "remotion render src/remotion/index.ts ShowcaseDemo public/demo/showcase.webm --codec=vp8",
    "video:poster": "remotion still src/remotion/index.ts ShowcaseDemo public/demo/poster.png --frame=45"
```

Create the output directory so renders have a home:

```
mkdir -p public/demo
```

**Verify**: `pnpm typecheck` → exit 0 (the new deps' types resolve; no source
files added yet so nothing else changes).

### Step 2: Remotion bundler config (Tailwind v4 + `@/*` alias)

Create `remotion.config.ts` at the repo root. This enables Tailwind v4 inside
Remotion (so the reused `AppWindow`/`FileGrid` classes work) and wires the `@/*`
path alias so `import { cn } from "@/lib/utils"` resolves in Remotion's webpack:

```ts
import path from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

Config.setVideoImageFormat("jpeg");
Config.setConcurrency(null); // auto

Config.overrideWebpackConfig((current) => {
  const withTailwind = enableTailwind(current);
  return {
    ...withTailwind,
    resolve: {
      ...withTailwind.resolve,
      alias: {
        ...(withTailwind.resolve?.alias ?? {}),
        "@": path.join(process.cwd(), "src"),
      },
    },
  };
});
```

**Verify**: `pnpm typecheck` → exit 0. (If `@remotion/cli/config` or
`@remotion/tailwind-v4` types fail to resolve, the install in Step 1 was
incomplete — STOP and report.)

### Step 3: Styles, fonts, and shared theme constants

Create `src/remotion/styles.css` — Tailwind v4 entry plus the design tokens
copied verbatim from `globals.css` so `var(--accent-amber)` etc. resolve:

```css
@import "tailwindcss";

:root {
  --accent-amber: oklch(0.83 0.16 85);
  --accent-amber-glow: oklch(0.83 0.16 85 / 0.25);
  --landing-bg: oklch(0.12 0 0);
  --landing-muted: oklch(0.7 0 0);
}
```

Create `src/remotion/fonts.ts` — load fonts so they are available during render:

```ts
import { loadFont as loadSans } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono";

export const sans = loadSans().fontFamily;
export const mono = loadMono().fontFamily;
```

> If `@remotion/google-fonts/GeistMono` does not resolve (the subpackage may not
> exist), fall back to `@remotion/google-fonts/JetBrainsMono` and note the
> substitution in your final report. Do not block on it.

Create `src/remotion/theme.ts` — single source of truth for colors + timing so
every scene is consistent:

```ts
export const FPS = 30;

export const colors = {
  bg: "#0a0a0a",          // ≈ var(--landing-bg)
  panel: "#0d0d0d",
  panelAlt: "#101010",
  amber: "oklch(0.83 0.16 85)",
  amberGlow: "oklch(0.83 0.16 85 / 0.25)",
  textHi: "rgba(255,255,255,0.92)",
  textMid: "rgba(255,255,255,0.55)",
  textLow: "rgba(255,255,255,0.35)",
};

// A reusable "premium" spring config for entrances.
export const enterSpring = { damping: 18, mass: 0.6, stiffness: 120 } as const;
```

Import the stylesheet from the entry in Step 7.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Build the "extra" reusable Remotion components

Create each file under `src/remotion/components/`. All animation must come from
`useCurrentFrame()` + `interpolate`/`spring` (never CSS animation). Code shapes
below are load-bearing patterns — match them; you may refine the visuals.

**`GridBackdrop.tsx`** — full-frame dark background with a faint grid and a
slowly drifting amber glow (port of `primitives/grid-bg` + `glow`, frame-driven):

```tsx
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { colors } from "../theme";

export const GridBackdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 300], [-30, 30]);
  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(600px 400px at ${50 + drift}% 35%, ${colors.amberGlow}, transparent 70%)`,
        }}
      />
    </AbsoluteFill>
  );
};
```

**`Caption.tsx`** — kinetic word-by-word caption that springs up. Props:
`{ text: string; startFrame?: number }`. Each word's opacity/translateY is a
spring delayed by its index (~3 frames apart). Use `spring({ frame: frame - delay, fps, config: enterSpring })`.
Render words as `inline-block` spans, font = `sans` from `fonts.ts`, color
`colors.textHi`, large weight 600, letter-spacing `-0.02em`, centered near the
lower third. Keep total caption ≤ 5 words so it reads in the time on screen.

**`Cursor.tsx`** — an SVG pointer that moves between target points and pulses on
"click". Props: `{ path: {x:number;y:number;atFrame:number}[]; clickFrames?: number[] }`.
Interpolate `x`/`y` across the path keyframes. On each click frame, render an
expanding amber ring (scale via spring, fading opacity). Use a simple arrow SVG
(filled white with subtle shadow).

**`SearchPalette.tsx`** — the frame-driven ⌘K palette (reimplements
`CommandPaletteMock`). Props: `{ query: string; results: string[]; typeStartFrame?: number; revealFrame?: number }`.
- Typed character count = `Math.floor(interpolate(frame, [typeStartFrame, typeStartFrame + query.length * 2.5], [0, query.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }))`.
- Show a blinking caret: visible when `Math.floor(frame / 8) % 2 === 0`.
- Results fade/slide in after `revealFrame`, staggered by index; first result
  gets the amber-highlight treatment (`bg` amber/10, `textHi`).
- Match the reference styling from `command-palette-mock.tsx`: rounded-xl panel,
  `#101010` bg, white/10 border, `Search` + `FileText` lucide icons, mono font,
  a `⌘K` kbd chip on the right. Mono font from `fonts.ts`.

**`DragFile.tsx`** — a file "chip" (mono filename + small icon) that travels from
a start point to an end point along an eased path and lands with a spring bounce.
Props: `{ label: string; from:{x;y}; to:{x;y}; startFrame:number; durationInFrames:number }`.
Use `spring()` for progress `0→1`, then `x = from.x + (to.x-from.x)*p`, same for
`y`, plus a slight `scale` overshoot on landing and a soft amber drop-shadow
while in flight. Style the chip like a `FileGrid` tile highlighted state
(amber/40 border, amber/10 bg, mono text).

**`BrandLockup.tsx`** — the intro/outro wordmark. Renders the `logo.png`
(`staticFile("/logo.png")` — it exists in `public/`) scaling in via spring, with
"S3 Dock" and the headline **"S3, finally usable."** revealed word-by-word
(reuse the `Caption` mechanism or inline it). Headline font `sans`, weight 600,
size ~96px, `colors.textHi`.

**Verify after creating all six**: `pnpm typecheck` → exit 0 and `pnpm lint` →
exit 0. (No unused imports/vars — `eslint src/` covers this folder.)

### Step 5: Build the five scenes

Each scene is a component that fills the frame (`AbsoluteFill`), composes the
components from Step 4 + the reused `AppWindow`/`FileGrid`, and animates purely
from `useCurrentFrame()`. Import the real mocks like:

```tsx
import { AppWindow } from "@/components/landing/mocks/app-window";
import { FileGrid, type FileItem } from "@/components/landing/mocks/file-grid";
```

Scene blueprints (keep copy short — captions must read at a glance):

1. **`IntroScene.tsx`** (~80 frames) — `GridBackdrop` + `BrandLockup`. Logo +
   "S3, finally usable." spring in. Fades toward the browse scene.

2. **`BrowseScene.tsx`** (~130 frames) — `GridBackdrop`, centered `AppWindow`
   titled `s3dock.com — my-bucket` with a `FileGrid` of ~8 `HERO_FILES`-style
   items (reuse names like `design-assets`, `hero.png` (highlighted), `report-q2.pdf`,
   `launch.mp4`, `archive.zip`, `notes.md`). Tiles stagger-in (per-tile spring by
   index — wrap each in a `<Sequence from={i*2}>` or compute delay). `Cursor`
   drifts across. `Caption`: **"Browse any bucket like a drive."**

3. **`SearchScene.tsx`** (~150 frames) — `GridBackdrop`, `SearchPalette` with
   `query="invoice.pdf"`, `results=["billing/2026/invoice.pdf","archive/invoice.pdf"]`.
   `Cursor` moves to the palette; caret types; results reveal; first result
   highlights. `Caption`: **"Search every bucket, instantly."**

4. **`DragScene.tsx`** (~140 frames) — `GridBackdrop`, two stacked mini panels
   (`prod / images` and `staging / images`, styled like `feature-bento`'s
   SplitViewTile — `#0d0d0d` panel, mono path label, small `FileGrid`). A
   `DragFile` labelled `hero-final.png` flies from the top panel into the dashed
   amber drop-zone of the bottom panel and lands with a bounce; `Cursor` follows
   it. `Caption`: **"Drag files across buckets."**

5. **`OutroScene.tsx`** (~130 frames) — `GridBackdrop` + `BrandLockup` (smaller),
   a pill button reading **"Get started"** (amber bg, black text — match
   `hero.tsx` CTA) and `s3dock.com` in mono beneath. End on the same composition
   as the intro's first frame so the loop is seamless. `Caption`:
   **"Your storage, finally usable."**

Export a `durationInFrames` constant from each scene file (e.g.
`export const INTRO_DURATION = 80`) so the assembler in Step 6 stays in sync.

**Verify**: `pnpm typecheck` → exit 0, `pnpm lint` → exit 0.

### Step 6: Assemble the scenes with transitions

Create `src/remotion/ShowcaseDemo.tsx` using `TransitionSeries` from
`@remotion/transitions` with spring-timed fades/slides between scenes. Compute
and export the total duration so the composition length always matches:

```tsx
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { FPS } from "./theme";
import { IntroScene, INTRO_DURATION } from "./scenes/IntroScene";
// ...import the other four scenes + their *_DURATION constants

const TRANSITION = 15; // frames each transition overlaps
const SCENES = [INTRO_DURATION, BROWSE_DURATION, SEARCH_DURATION, DRAG_DURATION, OUTRO_DURATION];

export const DEMO_DURATION =
  SCENES.reduce((a, b) => a + b, 0) - TRANSITION * (SCENES.length - 1);

const timing = () => springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION });

export const ShowcaseDemo: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={INTRO_DURATION}><IntroScene /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={timing()} />
    <TransitionSeries.Sequence durationInFrames={BROWSE_DURATION}><BrowseScene /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide()} timing={timing()} />
    {/* ...Search, Drag, Outro with fade/slide between each... */}
  </TransitionSeries>
);
```

> Note on TransitionSeries math: a `Transition` *overlaps* (consumes) frames from
> the sequences on both sides — that is why `DEMO_DURATION` subtracts
> `TRANSITION` per transition. Use the exported `DEMO_DURATION` for the
> composition length in Step 8; do not hand-type a number.

**Verify**: `pnpm typecheck` → exit 0.

### Step 7: Entry + Root (register the composition)

Create `src/remotion/index.ts`:

```ts
import "./styles.css";
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
```

Create `src/remotion/Root.tsx`:

```tsx
import { Composition } from "remotion";
import { ShowcaseDemo, DEMO_DURATION } from "./ShowcaseDemo";
import { FPS } from "./theme";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="ShowcaseDemo"
    component={ShowcaseDemo}
    durationInFrames={DEMO_DURATION}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
```

**Verify**: `pnpm typecheck` → exit 0, then `pnpm video:studio` opens the
Remotion Studio. Scrub the timeline: all five scenes play, transitions are
smooth, captions animate, fonts render (Space Grotesk + mono), nothing is blank
or unstyled. Close the studio. (If a scene is blank or unstyled, Tailwind/token
wiring from Steps 2–3 is wrong — fix before rendering.)

### Step 8: Render the three assets

```
pnpm video:render        # → public/demo/showcase.mp4
pnpm video:render:webm   # → public/demo/showcase.webm
pnpm video:poster        # → public/demo/poster.png
```

**Verify**:
- `ls -la public/demo/` shows all three files, each non-zero size (expect mp4
  roughly 1–6 MB at 1080p/20s; webm similar or smaller; png a few hundred KB).
- Open `public/demo/showcase.mp4` in any player: ~20s, plays start to finish,
  visually matches the studio preview.

### Step 9: Confirm the app is unaffected

**Verify**:
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0
- `pnpm build` → exit 0 (Next builds the app; it does not bundle `src/remotion`
  because no route imports it, but it *does* type-check the files — they must be
  clean).
- `git status` shows only the in-scope files added (the Remotion project, the
  `package.json` script/dep changes, and the three `public/demo/*` assets).

## Test plan

This is a visual marketing asset; there is no unit-test surface and the repo has
no rendering test harness. Verification is the studio preview (Step 7) + the
rendered output inspection (Step 8) + the unchanged-app gates (Step 9). Do **not**
add a test framework for this. Record in your final report:
- total duration (frames / seconds) and resolution actually rendered,
- file sizes of the three outputs,
- whether the Geist Mono font loaded or you fell back to JetBrains Mono.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `public/demo/showcase.mp4`, `public/demo/showcase.webm`, `public/demo/poster.png` all exist and are non-zero (`ls -la public/demo`)
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm build` exits 0
- [ ] `pnpm video:studio` renders all five scenes with no blank/unstyled frames (visual confirm)
- [ ] No app/route code changed: `git diff --name-only` lists nothing under `src/app/` or `src/components/` except *nothing in `src/components/landing`* (the mocks were imported, not edited)
- [ ] `git diff src/components/landing/video-modal.tsx` is empty
- [ ] `plans/README.md` status row for 058 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `video-modal.tsx` no longer references
  `/demo/showcase.webm` / `.mp4` / `poster.png` — the asset paths/contract
  changed; re-confirm targets before rendering.
- `@remotion/tailwind-v4` integration fails and Tailwind classes do not apply in
  the studio after a reasonable fix attempt. **Escape hatch**: the only Tailwind
  consumers are the reused `AppWindow`/`FileGrid`; reimplement those two as small
  inline-styled Remotion components inside `src/remotion/components/` (do NOT edit
  the originals) and drop the `@remotion/tailwind-v4` dependency + the
  `enableTailwind` override. Report that you took this path.
- `pnpm build` or `pnpm typecheck` fails **because of** a Remotion/CLI type that
  cannot be satisfied in the Next type-check context (not a trivial fix).
- The headless Chrome download fails (no network) — renders cannot run; report
  that the project is complete but assets are unrendered, and hand off the
  `pnpm video:render*` commands.
- A render produces a file but it is visibly broken (missing fonts, black
  frames, wrong colors) and one fix attempt does not resolve it.

## Maintenance notes

For whoever owns this after it lands:
- **Editing the video** = editing React in `src/remotion/` then re-running the
  three `pnpm video:*` commands and re-committing the outputs. The rendered
  binaries in `public/demo/` are committed artifacts so the deployed landing page
  has the demo without a render step in CI.
- If the brand tokens in `globals.css` change, mirror them in
  `src/remotion/styles.css` + `theme.ts` (they are duplicated by necessity —
  Remotion's bundler can't import the app's `globals.css` wholesale because it
  pulls in app-only layers).
- If `AppWindow`/`FileGrid` props change, the scenes that import them
  (`BrowseScene`, `DragScene`) may break the next render — re-preview in studio.
- A reviewer should scrutinize: (a) no app/route code changed, (b) the three
  asset paths exactly match `video-modal.tsx`, (c) the studio preview is smooth
  and on-brand, (d) `package.json` only gained the deps + four `video:*` scripts.
- Deferred (intentionally not in this plan): real `<track>` caption files,
  background music, voiceover, and a 720p variant — all were ruled out by the
  "~20s silent loop" decision and can be follow-ups.
```
