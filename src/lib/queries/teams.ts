"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Role } from "@/lib/roles";

export interface TeamSummary {
  id: string;
  name: string;
  slug: string;
  role: Role;
  workspaceId: string;
  memberCount: number;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  userId: string;
  role: Role;
  email: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
}

export interface TeamDetail {
  id: string;
  name: string;
  slug: string;
  role: Role;
  workspaceId: string;
  members: TeamMember[];
}

const teamKeys = {
  all: ["teams"] as const,
  list: () => [...teamKeys.all, "list"] as const,
  detail: (teamId: string) => [...teamKeys.all, "detail", teamId] as const,
};

async function fetchTeams(): Promise<TeamSummary[]> {
  const response = await fetch("/api/teams");
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch teams");
  }
  return response.json();
}

async function fetchTeam(teamId: string): Promise<TeamDetail> {
  const response = await fetch(`/api/teams/${teamId}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch team");
  }
  return response.json();
}

async function createTeam(data: { name: string; slug?: string }): Promise<TeamSummary> {
  const response = await fetch("/api/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create team");
  }

  return response.json();
}

async function addTeamMember(
  teamId: string,
  data: { email: string; role: Role }
): Promise<TeamMember> {
  const response = await fetch(`/api/teams/${teamId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to add member");
  }

  return response.json();
}

async function updateTeamMemberRole(
  teamId: string,
  memberId: string,
  role: Role
): Promise<{ id: string; userId: string; role: Role }> {
  const response = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update member role");
  }

  return response.json();
}

async function removeTeamMember(teamId: string, memberId: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to remove member");
  }

  return response.json();
}

export function useTeams() {
  return useQuery({
    queryKey: teamKeys.list(),
    queryFn: fetchTeams,
  });
}

export function useTeam(teamId: string | null) {
  return useQuery({
    queryKey: teamId ? teamKeys.detail(teamId) : [...teamKeys.all, "detail", "none"],
    queryFn: () => fetchTeam(teamId!),
    enabled: !!teamId,
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.all });
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function useAddTeamMember(teamId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { email: string; role: Role }) =>
      addTeamMember(teamId!, data),
    onSuccess: () => {
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
      }
      queryClient.invalidateQueries({ queryKey: teamKeys.list() });
    },
  });
}

export function useUpdateTeamMemberRole(teamId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: Role }) =>
      updateTeamMemberRole(teamId!, memberId, role),
    onSuccess: () => {
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
      }
    },
  });
}

export function useRemoveTeamMember(teamId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberId: string) => removeTeamMember(teamId!, memberId),
    onSuccess: () => {
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
      }
      queryClient.invalidateQueries({ queryKey: teamKeys.list() });
    },
  });
}
