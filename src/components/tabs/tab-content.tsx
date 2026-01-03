"use client";

import { useLayoutStore } from "@/lib/stores/layout-store";
import { BucketList } from "@/components/buckets/bucket-list";
import { FileBrowser } from "@/components/browser/file-browser";

interface TabContentProps {
  paneId: string;
}

export function TabContent({ paneId }: TabContentProps) {
  const { panes, updateTabPath, updateTabBucket, resetTabToBuckets } = useLayoutStore();
  const pane = panes[paneId];

  if (!pane) return null;

  const activeTab = pane.tabs.find((t) => t.id === pane.activeTabId);

  if (!activeTab) {
    return null;
  }

  const handleOpenBucket = (connectionId: string, connectionName: string, bucketName: string) => {
    updateTabBucket(paneId, activeTab.id, connectionId, connectionName, bucketName);
  };

  const handleGoHome = () => {
    resetTabToBuckets(paneId, activeTab.id);
  };

  if (activeTab.type === "buckets") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Buckets</h1>
        <BucketList onOpenBucket={handleOpenBucket} />
      </div>
    );
  }

  if (activeTab.type === "browser" && activeTab.connectionId && activeTab.bucket) {
    const pathArray = activeTab.path
      ? activeTab.path.split("/").filter(Boolean)
      : [];

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">File Browser</h1>
          {activeTab.connectionName && (
            <span className="text-sm text-muted-foreground">
              ({activeTab.connectionName})
            </span>
          )}
        </div>
        <FileBrowser
          connectionId={activeTab.connectionId}
          bucket={activeTab.bucket}
          path={pathArray}
          onNavigate={(newPath) => updateTabPath(paneId, activeTab.id, newPath)}
          onGoHome={handleGoHome}
        />
      </div>
    );
  }

  return null;
}
