"use client";

import Image from "next/image";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

const LINKS = [
  ["Features", "#features"],
  ["Pricing", "#pricing"],
] as const;

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 px-4">
      <nav aria-label="Main" className="mx-auto mt-4 flex max-w-5xl items-center justify-between rounded-2xl border border-white/10 bg-black/50 px-4 py-2.5 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="S3 Dock"
            width={24}
            height={24}
            className="rounded-md invert"
          />
          <span className="text-sm font-semibold tracking-tight text-white">
            S3 Dock
          </span>
        </Link>

        <div className="hidden items-center gap-6 text-sm text-white/60 md:flex">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href} className="transition-colors hover:text-white">
              {label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <SignedOut>
            <Link
              href="/sign-in"
              className="hidden rounded-lg px-3 py-1.5 text-sm text-white/60 transition-colors hover:text-white sm:block"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg bg-[var(--accent-amber)] px-3.5 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
            >
              Try free
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/buckets"
              className="rounded-lg bg-[var(--accent-amber)] px-3.5 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
            >
              Open app
            </Link>
          </SignedIn>
        </div>
      </nav>
    </header>
  );
}
