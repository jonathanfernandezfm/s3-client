"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLayoutStore } from "@/lib/stores/layout-store";
import { useConnections } from "@/lib/queries/connections";
import { Loader2 } from "lucide-react";

interface BrowserRedirectProps {
  connectionId: string;
  bucket: string;
  path?: string[];
}

export function BrowserRedirect({ connectionId, bucket, path = [] }: BrowserRedirectProps) {
  const router = useRouter();
  const { panes, focusedPaneId, addTab, setActiveTab, updateTabPath } = useLayoutStore();
  const { data: connections } = useConnections();

  useEffect(() => {
    const pathString = path.length > 0 ? path.join("/") + "/" : "";
    const connection = connections?.find((c) => c.id === connectionId);
    const connectionName = connection?.name || connection?.endpoint || "";

    // Find an existing tab for this bucket across all panes
    let existingTabInfo: { paneId: string; tabId: string } | null = null;

    for (const [paneId, pane] of Object.entries(panes)) {
      const existingTab = pane.tabs.find(
        (t) =>
          t.type === "browser" &&
          t.connectionId === connectionId &&
          t.bucket === bucket
      );
      if (existingTab) {
        existingTabInfo = { paneId, tabId: existingTab.id };
        break;
      }
    }

    if (existingTabInfo) {
      // Update the path of the existing tab and switch to it
      updateTabPath(existingTabInfo.paneId, existingTabInfo.tabId, pathString);
      setActiveTab(existingTabInfo.paneId, existingTabInfo.tabId);
    } else {
      // Add a new tab to the focused pane
      const targetPaneId = focusedPaneId || Object.keys(panes)[0];
      if (targetPaneId) {
        addTab(targetPaneId, {
          type: "browser",
          connectionId,
          connectionName,
          bucket,
          path: pathString,
        });
      }
    }

    // Redirect to buckets page where tabs are displayed
    router.replace("/buckets");
  }, [connectionId, bucket, path, connections, panes, focusedPaneId, addTab, setActiveTab, updateTabPath, router]);

  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
