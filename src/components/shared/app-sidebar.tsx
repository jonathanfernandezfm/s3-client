"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLayoutStore } from "@/lib/stores/layout-store";
import { useWorkspaces } from "@/lib/queries/workspaces";
import { Database, Settings, FolderOpen, Users, Plug } from "lucide-react";

export function AppSidebar() {
  const pathname = usePathname();
  const { selectedWorkspace } = useWorkspaces();
  const { panes, focusedPaneId, resetTabToBuckets } = useLayoutStore();

  const isSettingsActive =
    pathname === "/settings" || pathname.startsWith("/settings/");

  const isConnectionsActive =
    pathname === "/connections" || pathname.startsWith("/connections/");

  const isTeamsActive = pathname === "/teams" || pathname.startsWith("/teams/");

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
          <li>
            <Link
              href="/connections"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isConnectionsActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Plug className="h-4 w-4" />
              Connections
            </Link>
          </li>
          <li>
            <Link
              href="/teams"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isTeamsActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Users className="h-4 w-4" />
              Teams
            </Link>
          </li>
        </ul>
      </nav>

      <div className="p-4 border-t space-y-3">
        {selectedWorkspace && (
          <div className="text-xs text-muted-foreground px-3">
            Workspace: <span className="font-medium text-foreground">{selectedWorkspace.name}</span>
          </div>
        )}
        <Link
          href="/settings"
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
      </div>
    </aside>
  );
}
