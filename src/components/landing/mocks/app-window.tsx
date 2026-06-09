import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface AppWindowProps {
  children: ReactNode;
  /** Mono path/title shown in the title bar, e.g. "my-bucket / images". */
  title?: string;
  /** Optional tab strip under the traffic lights. */
  tabs?: string[];
  activeTab?: number;
  /** Optional sidebar slot. */
  sidebar?: ReactNode;
  className?: string;
}

/**
 * Faux browser/app chrome wrapping every product mock on the landing page.
 * Swap point: replace children with a real screenshot or <video> later
 * without touching the surrounding section layout.
 */
export function AppWindow({
  children,
  title,
  tabs,
  activeTab = 0,
  sidebar,
  className,
}: AppWindowProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-2xl",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        {title && (
          <span className="ml-3 truncate font-mono text-xs text-white/40">{title}</span>
        )}
      </div>
      {tabs && tabs.length > 0 && (
        <div className="flex gap-1 border-b border-white/5 px-3 pt-2">
          {tabs.map((tab, i) => (
            <span
              key={tab}
              className={cn(
                "rounded-t-lg px-3 py-1.5 font-mono text-[11px] transition-colors",
                i === activeTab
                  ? "border border-b-0 border-white/10 bg-white/5 text-white/80"
                  : "text-white/35"
              )}
            >
              {tab}
            </span>
          ))}
        </div>
      )}
      <div className="flex">
        {sidebar && (
          <div className="hidden w-40 shrink-0 border-r border-white/5 p-3 sm:block">
            {sidebar}
          </div>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
