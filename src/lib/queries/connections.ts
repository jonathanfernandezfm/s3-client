"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Role } from "@/lib/roles";
import { track } from "@/lib/analytics";

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
  role: Role;
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
  list: () => [...connectionKeys.all, "list"] as const,
  detail: (id: string) => [...connectionKeys.all, "detail", id] as const,
};

async function fetchConnections(): Promise<ConnectionResponse[]> {
  const response = await fetch("/api/connections");

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
  return useQuery({
    queryKey: connectionKeys.list(),
    queryFn: fetchConnections,
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

  return useMutation({
    mutationFn: (data: ConnectionInput) => createConnection(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: connectionKeys.all });
      track({ name: "connection_created", props: { workspace_type: data.workspaceType } });
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
      track({ name: "connection_deleted" });
    },
  });
}

export interface ImportProfilePayload {
  name: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface ImportProfileResult {
  name: string;
  status: "saved" | "invalid";
  connectionId?: string;
  error?: string;
}

export interface ImportAwsProfilesInput {
  workspaceId?: string;
  profiles: ImportProfilePayload[];
}

export interface ImportAwsProfilesResponse {
  results: ImportProfileResult[];
}

async function importAwsProfiles(
  input: ImportAwsProfilesInput
): Promise<ImportAwsProfilesResponse> {
  const response = await fetch("/api/connections/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Failed to import AWS profiles");
  }

  return response.json();
}

export function useImportAwsProfiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ImportAwsProfilesInput) => importAwsProfiles(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionKeys.all });
    },
  });
}
