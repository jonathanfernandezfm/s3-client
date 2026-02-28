"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";

export interface ConnectionResponse {
  id: string;
  name: string | null;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
  workspaceId: string;
  workspaceType: "PERSONAL" | "TEAM";
  role: "ADMIN" | "VIEWER";
  createdAt: string;
  updatedAt?: string;
}

export interface ConnectionInput {
  name?: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  workspaceId?: string;
}

export const connectionKeys = {
  all: ["connections"] as const,
  list: (workspaceId?: string | null) =>
    [...connectionKeys.all, "list", workspaceId ?? "all"] as const,
  detail: (id: string) => [...connectionKeys.all, "detail", id] as const,
};

async function fetchConnections(
  workspaceId?: string | null
): Promise<ConnectionResponse[]> {
  const params = workspaceId
    ? `?workspaceId=${encodeURIComponent(workspaceId)}`
    : "";
  const response = await fetch(`/api/connections${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch connections");
  }

  return response.json();
}

async function fetchConnection(id: string): Promise<ConnectionResponse> {
  const response = await fetch(`/api/connections/${id}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch connection");
  }

  return response.json();
}

async function createConnection(
  data: ConnectionInput
): Promise<ConnectionResponse> {
  const response = await fetch("/api/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create connection");
  }

  return response.json();
}

async function updateConnection(
  id: string,
  data: Partial<ConnectionInput>
): Promise<ConnectionResponse> {
  const response = await fetch(`/api/connections/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update connection");
  }

  return response.json();
}

async function deleteConnection(id: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/connections/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete connection");
  }

  return response.json();
}

export function useConnections() {
  const selectedWorkspaceId = useWorkspaceStore((s) => s.selectedWorkspaceId);

  return useQuery({
    queryKey: connectionKeys.list(selectedWorkspaceId),
    queryFn: () => fetchConnections(selectedWorkspaceId),
    enabled: !!selectedWorkspaceId,
  });
}

export function useConnection(id: string) {
  return useQuery({
    queryKey: connectionKeys.detail(id),
    queryFn: () => fetchConnection(id),
    enabled: !!id,
  });
}

export function useCreateConnection() {
  const queryClient = useQueryClient();
  const selectedWorkspaceId = useWorkspaceStore((s) => s.selectedWorkspaceId);

  return useMutation({
    mutationFn: (data: ConnectionInput) =>
      createConnection({
        ...data,
        workspaceId: data.workspaceId ?? selectedWorkspaceId ?? undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionKeys.all });
    },
  });
}

export function useUpdateConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ConnectionInput> }) =>
      updateConnection(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionKeys.all });
    },
  });
}

export function useDeleteConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteConnection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionKeys.all });
    },
  });
}
