"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/lib/stores/connection-store";
import { useLayoutStore } from "@/lib/stores/layout-store";
import { useConnections } from "@/lib/queries/connections";
import { Database, Settings, FolderOpen, CheckCircle2, XCircle } from "lucide-react";

export function AppSidebar() {
  const pathname = usePathname();
  const { data: connections = [] } = useConnections();
  const { statuses } = useConnectionStore();
  const { panes, focusedPaneId, resetTabToBuckets } = useLayoutStore();

  const connectedCount = connections.filter(
    (conn) => statuses[conn.id]?.connected
  ).length;

  const isSettingsActive =
    pathname === "/settings/connections" ||
    pathname.startsWith("/settings/connections/");

  const isBucketsActive =
    pathname === "/buckets" || pathname.startsWith("/buckets/") || pathname.startsWith("/browser/");

  const handleBucketsClick = () => {
    // Reset the active tab in the focused pane to buckets
    const targetPaneId = focusedPaneId || Object.keys(panes)[0];
    if (targetPaneId) {
      const pane = panes[targetPaneId];
      if (pane?.activeTabId) {
        resetTabToBuckets(targetPaneId, pane.activeTabId);
      }
    }
  };

  return (
    <aside className="w-64 border-r bg-sidebar-background min-h-screen flex flex-col">
      <div className="p-4 border-b">
        <Link href="/buckets" className="flex items-center gap-2" onClick={handleBucketsClick}>
          <FolderOpen className="h-6 w-6 text-sidebar-primary" />
          <span className="font-semibold text-lg">S3 Client</span>
        </Link>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          <li>
            <Link
              href="/buckets"
              onClick={handleBucketsClick}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isBucketsActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Database className="h-4 w-4" />
              Buckets
            </Link>
          </li>
        </ul>
      </nav>

      <div className="p-4 border-t space-y-3">
        <Link
          href="/settings/connections"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
            isSettingsActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50"
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>

        <div className="flex items-center gap-2 text-sm px-3">
          {connectedCount > 0 ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">
                {connectedCount} connection{connectedCount !== 1 ? "s" : ""}
              </span>
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
