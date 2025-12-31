"use client";

import { useConnectionStore } from "@/lib/stores/connection-store";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function Header() {
  const { connection, status, clearConnection } = useConnectionStore();

  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        {status.connected && connection && (
          <div className="text-sm">
            <span className="text-muted-foreground">Endpoint: </span>
            <span className="font-medium">{connection.endpoint}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        {status.connected && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearConnection}
            className="text-muted-foreground"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Disconnect
          </Button>
        )}
      </div>
    </header>
  );
}
