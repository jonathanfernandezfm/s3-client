import Image from "next/image";
import Link from "next/link";

const COLUMNS = [
  {
    title: "Product",
    links: [
      ["Features", "#features"],
      ["Pricing", "#pricing"],
      ["Changelog", "#"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Docs", "#"],
      ["Status", "#"],
      ["Blog", "#"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "#"],
      ["Contact", "mailto:hello@s3dock.app"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Privacy", "#"],
      ["Terms", "#"],
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-black/40 px-6 py-16">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-10 sm:grid-cols-4">
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="text-xs font-medium uppercase tracking-widest text-white/40">
              {col.title}
            </p>
            <ul className="mt-4 space-y-2.5">
              {col.links.map(([label, href]) => (
                <li key={label}>
                  <a
                    href={href}
                    className="text-sm text-white/60 transition-colors hover:text-[var(--accent-amber)]"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-14 flex max-w-5xl flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 sm:flex-row">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="S3 Dock"
            width={20}
            height={20}
            className="rounded invert"
          />
          <span className="text-sm font-semibold text-white">S3 Dock</span>
        </Link>
        <p className="text-xs text-white/40">
          © {new Date().getFullYear()} S3 Dock. All rights reserved.
        </p>
        <div className="flex gap-4 text-sm text-white/40">
          <a href="https://github.com" className="transition-colors hover:text-white">
            GitHub
          </a>
          <a href="https://x.com" aria-label="X (formerly Twitter)" className="transition-colors hover:text-white">
            X
          </a>
        </div>
      </div>
    </footer>
  );
}
