import Image from "next/image";
import Link from "next/link";
import { Globe2, Shield, Zap } from "lucide-react";
import { Glow } from "@/components/landing/primitives/glow";
import { GridBg } from "@/components/landing/primitives/grid-bg";

const FEATURES = [
  { icon: Zap, label: "Browse buckets like a drive" },
  { icon: Globe2, label: "AWS S3, R2, MinIO — every S3" },
  { icon: Shield, label: "Credentials encrypted at rest" },
] as const;

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing dark relative flex min-h-screen overflow-hidden bg-[var(--landing-bg)] text-white antialiased">
      <GridBg />
      <Glow className="left-1/2 top-0 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2" />

      {/* Left: brand panel (desktop only) */}
      <div className="relative z-10 hidden w-1/2 flex-col justify-between border-r border-white/5 p-12 lg:flex">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="S3 Dock"
            width={32}
            height={32}
            className="rounded-md invert"
          />
          <span className="text-xl font-semibold tracking-tight">S3 Dock</span>
        </Link>

        <div className="space-y-8">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            S3, finally usable.
          </h1>
          <p className="max-w-md text-lg text-[var(--landing-muted)]">
            Browse, search, and move files across every S3-compatible bucket —
            like it&apos;s a drive.
          </p>
          <div className="space-y-3 pt-2">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-white/70">
                <span className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                  <Icon className="size-4 text-[var(--accent-amber)]" />
                </span>
                {label}
              </div>
            ))}
          </div>
        </div>

        <p className="font-mono text-xs text-white/40">
          s3dock.app — one client, every S3.
        </p>
      </div>

      {/* Right: auth form */}
      <div className="relative z-10 flex flex-1 items-center justify-center bg-[var(--accent-amber)]/[0.06] p-6 sm:p-8">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="mb-8 flex items-center justify-center gap-2 lg:hidden"
          >
            <Image
              src="/logo.png"
              alt="S3 Dock"
              width={28}
              height={28}
              className="rounded-md invert"
            />
            <span className="text-lg font-semibold">S3 Dock</span>
          </Link>
          <div className="rounded-2xl border border-white/10 bg-[#0d0d0d]/80 p-6 shadow-2xl backdrop-blur sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
