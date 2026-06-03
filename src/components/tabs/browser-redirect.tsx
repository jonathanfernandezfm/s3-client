"use client";

import { useEffect, useRef } from "react";
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
  const { addTab, setActiveTab, updateTabPath } = useLayoutStore();
  const { data: connections } = useConnections();
  const didRedirect = useRef(false);

  useEffect(() => {
    if (didRedirect.current || !connections) return;
    didRedirect.current = true;

    const pathString = path.length > 0 ? path.join("/") + "/" : "";
    const connection = connections.find((c) => c.id === connectionId);
    const connectionName = connection?.name || connection?.endpoint || "";

    // Read panes snapshot without subscribing — avoids re-render loop
    const { panes, focusedPaneId } = useLayoutStore.getState();

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
      updateTabPath(existingTabInfo.paneId, existingTabInfo.tabId, pathString);
      setActiveTab(existingTabInfo.paneId, existingTabInfo.tabId);
    } else {
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

    router.replace("/buckets");
  }, [connections, connectionId, bucket, path, addTab, setActiveTab, updateTabPath, router]);

  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
