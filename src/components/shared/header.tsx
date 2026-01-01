"use client";

import { useConnectionStore } from "@/lib/stores/connection-store";
import { useConnections } from "@/lib/queries/connections";
import { ThemeToggle } from "./theme-toggle";

export function Header() {
  const { data: connections = [] } = useConnections();
  const { statuses } = useConnectionStore();

  const connectedConnections = connections.filter(
    (conn) => statuses[conn.id]?.connected
  );

  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        {connectedConnections.length > 0 && (
          <div className="text-sm">
            <span className="text-muted-foreground">Connected to: </span>
            <span className="font-medium">
              {connectedConnections
                .map((c) => c.name || c.endpoint)
                .join(", ")}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
