"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/lib/stores/connection-store";
import { Database, Settings, FolderOpen, CheckCircle2, XCircle } from "lucide-react";

const navItems = [
  {
    title: "Buckets",
    href: "/buckets",
    icon: Database,
  },
  {
    title: "Settings",
    href: "/settings/connections",
    icon: Settings,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { status } = useConnectionStore();

  return (
    <aside className="w-64 border-r bg-sidebar-background min-h-screen flex flex-col">
      <div className="p-4 border-b">
        <Link href="/buckets" className="flex items-center gap-2">
          <FolderOpen className="h-6 w-6 text-sidebar-primary" />
          <span className="font-semibold text-lg">S3 Client</span>
        </Link>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t">
        <div className="flex items-center gap-2 text-sm">
          {status.connected ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">Connected</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Not connected</span>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
