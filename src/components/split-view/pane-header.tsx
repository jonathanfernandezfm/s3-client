"use client";

import { useLayoutStore } from "@/lib/stores/layout-store";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaneHeaderProps {
  paneId: string;
}

export function PaneHeader({ paneId }: PaneHeaderProps) {
  const { panes, focusedPaneId, removePane } = useLayoutStore();

  const isFocused = focusedPaneId === paneId;
  const canClose = Object.keys(panes).length > 1;

  const handleClose = () => {
    removePane(paneId);
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between px-2 py-1 border-b bg-muted/30",
        isFocused && "bg-primary/5"
      )}
    >
      <div className="flex items-center gap-1">
        {isFocused && (
          <div className="w-2 h-2 rounded-full bg-primary mr-1" />
        )}
      </div>
      <div className="flex items-center gap-1">
        {canClose && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
            onClick={handleClose}
            title="Close pane"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
