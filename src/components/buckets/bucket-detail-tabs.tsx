"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BarChart3, Database, Lock, RefreshCw, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConnections } from "@/lib/queries/connections";
import { canManageFiles } from "@/lib/roles";
import { resolveBucketTab, type BucketTabKey } from "./bucket-tab-key";
import { ComingSoonTab } from "./coming-soon-tab";
import { MultipartUploadsTab } from "./multipart-uploads-tab";
import { OverviewTab } from "./overview-tab";
import { PermissionsTab } from "./permissions-tab";

const TAB_DEFINITIONS = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "multipart", label: "Incomplete uploads", icon: RefreshCw },
  { key: "lifecycle", label: "Lifecycle rules", icon: Repeat, badge: "Soon" },
  { key: "permissions", label: "Permissions", icon: Lock },
] as const;

interface BucketDetailTabsProps {
  connectionId: string;
  bucket: string;
}

export function BucketDetailTabs({ connectionId, bucket }: BucketDetailTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: BucketTabKey = resolveBucketTab(rawTab);

  const { data: connections = [] } = useConnections();
  const connection = connections.find((c) => c.id === connectionId);
  const canAbort = canManageFiles(connection?.role ?? null);

  const setTab = (key: BucketTabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.push(`/app/buckets/${connectionId}/${encodeURIComponent(bucket)}?${params.toString()}`);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="border-b px-6 py-4 space-y-3 pb-0">
        <Link
          href="/app/buckets"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to buckets
        </Link>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-muted-foreground shrink-0" />
          <h1 className="text-xl font-semibold truncate">{bucket}</h1>
          {connection && (
            <span className="text-xs text-muted-foreground truncate">
              · {connection.name || connection.endpoint}
            </span>
          )}
        </div>
        <nav className="flex items-center gap-1 -mb-px">
          {TAB_DEFINITIONS.map((def) => {
            const { key, label, icon: Icon } = def;
            const badge = "badge" in def ? def.badge : undefined;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm border-b-2 transition-colors",
                  key === activeTab
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {badge && (
                  <span className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "overview" && (
          <OverviewTab connectionId={connectionId} bucket={bucket} />
        )}
        {activeTab === "multipart" && (
          <MultipartUploadsTab
            connectionId={connectionId}
            bucket={bucket}
            canAbort={canAbort}
          />
        )}
        {activeTab === "lifecycle" && (
          <ComingSoonTab
            title="Lifecycle rules coming soon"
            description="Configure auto-deletion, storage-class transitions, and auto-aborting of incomplete uploads."
          />
        )}
        {activeTab === "permissions" && (
          <PermissionsTab connectionId={connectionId} bucket={bucket} />
        )}
      </div>
    </div>
  );
}
