"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaces } from "@/lib/queries/workspaces";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useLayoutStore } from "@/lib/stores/layout-store";
import { Briefcase, ChevronDown, Loader2, Users } from "lucide-react";

export function WorkspaceSwitcher() {
  const { data: workspaces = [], isLoading, selectedWorkspace } = useWorkspaces();
  const setSelectedWorkspaceId = useWorkspaceStore((s) => s.setSelectedWorkspaceId);
  const { focusedPaneId, panes, resetTabToBuckets } = useLayoutStore();

  const handleWorkspaceSelect = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);

    const targetPaneId = focusedPaneId || Object.keys(panes)[0];
    if (!targetPaneId) {
      return;
    }

    const activeTabId = panes[targetPaneId]?.activeTabId;
    if (activeTabId) {
      resetTabToBuckets(targetPaneId, activeTabId);
    }
  };

  if (isLoading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  if (workspaces.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-[220px] justify-between gap-2">
          <span className="truncate">{selectedWorkspace?.name ?? "Select workspace"}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((workspace) => {
          const isSelected = workspace.id === selectedWorkspace?.id;
          return (
            <DropdownMenuItem
              key={workspace.id}
              onClick={() => handleWorkspaceSelect(workspace.id)}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2 truncate">
                {workspace.type === "TEAM" ? (
                  <Users className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="truncate">{workspace.name}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {workspace.role}
                {isSelected ? " · Active" : ""}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
