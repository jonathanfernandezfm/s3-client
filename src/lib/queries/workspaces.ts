"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";

export interface WorkspaceSummary {
  id: string;
  type: "PERSONAL" | "TEAM";
  name: string;
  role: "ADMIN" | "VIEWER";
}

export const workspaceKeys = {
  all: ["workspaces"] as const,
  list: () => [...workspaceKeys.all, "list"] as const,
};

async function fetchWorkspaces(): Promise<WorkspaceSummary[]> {
  const response = await fetch("/api/workspaces");

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch workspaces");
  }

  return response.json();
}

export function useWorkspaces() {
  const selectedWorkspaceId = useWorkspaceStore((s) => s.selectedWorkspaceId);
  const setSelectedWorkspaceId = useWorkspaceStore((s) => s.setSelectedWorkspaceId);

  const query = useQuery({
    queryKey: workspaceKeys.list(),
    queryFn: fetchWorkspaces,
  });

  useEffect(() => {
    const items = query.data ?? [];
    if (items.length === 0) {
      return;
    }

    const selectedStillValid = selectedWorkspaceId
      ? items.some((item) => item.id === selectedWorkspaceId)
      : false;

    if (!selectedStillValid) {
      const personal = items.find((item) => item.type === "PERSONAL");
      setSelectedWorkspaceId((personal ?? items[0]).id);
    }
  }, [query.data, selectedWorkspaceId, setSelectedWorkspaceId]);

  const selectedWorkspace = useMemo(
    () => (query.data ?? []).find((item) => item.id === selectedWorkspaceId) ?? null,
    [query.data, selectedWorkspaceId]
  );

  return {
    ...query,
    selectedWorkspaceId,
    selectedWorkspace,
  };
}
