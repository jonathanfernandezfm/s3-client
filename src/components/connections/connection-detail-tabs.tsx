"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BarChart3, Lock, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConnections } from "@/lib/queries/connections";
import { ConnectionOverviewTab } from "./connection-overview-tab";
import { ConnectionPermissionsTab } from "./connection-permissions-tab";

const TAB_DEFINITIONS = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "permissions", label: "Permissions", icon: Lock },
] as const;

type TabKey = (typeof TAB_DEFINITIONS)[number]["key"];

function isTabKey(value: string | null): value is TabKey {
  return TAB_DEFINITIONS.some((t) => t.key === value);
}

interface ConnectionDetailTabsProps {
  connectionId: string;
}

export function ConnectionDetailTabs({ connectionId }: ConnectionDetailTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: TabKey = isTabKey(rawTab) ? rawTab : "overview";

  const { data: connections = [] } = useConnections();
  const connection = connections.find((c) => c.id === connectionId);
  const displayName = connection?.name || connection?.endpoint || "Connection";
  const showEndpointSubtitle = !!(connection?.name && connection?.endpoint);

  const setTab = (key: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.push(`/app/connections/${connectionId}?${params.toString()}`);
  };

  const TAB_KEYS = TAB_DEFINITIONS.map((d) => d.key);

  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    const idx = TAB_KEYS.indexOf(activeTab);
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % TAB_KEYS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + TAB_KEYS.length) % TAB_KEYS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TAB_KEYS.length - 1;
    else return;
    e.preventDefault();
    setTab(TAB_KEYS[next]);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="border-b px-6 py-4 space-y-3 pb-0">
        <Link
          href="/app/connections"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to connections
        </Link>
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-muted-foreground shrink-0" />
          <h1 className="text-xl font-semibold truncate">{displayName}</h1>
          {showEndpointSubtitle && (
            <span className="text-xs text-muted-foreground truncate">
              · {connection!.endpoint}
            </span>
          )}
        </div>
        <nav role="tablist" aria-label="Connection sections" className="flex items-center gap-1 -mb-px">
          {TAB_DEFINITIONS.map(({ key, label, icon: Icon }) => {
            const selected = key === activeTab;
            return (
              <button
                key={key}
                id={`connection-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="connection-tabpanel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(key)}
                onKeyDown={handleTabKeyDown}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm border-b-2 transition-colors",
                  selected
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </nav>
      </header>

      <div
        id="connection-tabpanel"
        role="tabpanel"
        aria-labelledby={`connection-tab-${activeTab}`}
        tabIndex={0}
        className="flex-1 overflow-y-auto p-6"
      >
        {activeTab === "overview" && (
          <ConnectionOverviewTab connectionId={connectionId} />
        )}
        {activeTab === "permissions" && (
          <ConnectionPermissionsTab connectionId={connectionId} />
        )}
      </div>
    </div>
  );
}
