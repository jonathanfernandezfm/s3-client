import { cn } from "@/lib/utils";

/** Faint geometric grid backdrop, masked to fade toward the bottom. */
export function GridBg({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
        WebkitMaskImage:
          "radial-gradient(ellipse 90% 70% at 50% 0%, black 40%, transparent 100%)",
        maskImage:
          "radial-gradient(ellipse 90% 70% at 50% 0%, black 40%, transparent 100%)",
      }}
    />
  );
}
