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
  currentMemberId: string;
  workspaceId: string;
  members: TeamMember[];
}

export interface TeamInvite {
  id: string;
  role: Role;
  email: string | null;
  url: string;
  expiresAt: string;
  createdAt: string;
}

export interface CreatedInvite {
  id: string;
  role: Role;
  token: string;
  url: string;
  expiresAt: string;
}

const teamKeys = {
  all: ["teams"] as const,
  list: () => [...teamKeys.all, "list"] as const,
  detail: (teamId: string) => [...teamKeys.all, "detail", teamId] as const,
  invites: (teamId: string) => [...teamKeys.all, "invites", teamId] as const,
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

async function renameTeam(teamId: string, name: string): Promise<{ id: string; name: string }> {
  const response = await fetch(`/api/teams/${teamId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to rename team");
  }

  return response.json();
}

async function deleteTeam(teamId: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/teams/${teamId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete team");
  }

  return response.json();
}

export function useRenameTeam(teamId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => renameTeam(teamId!, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.all });
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (teamId: string) => deleteTeam(teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.all });
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function useLeaveTeam(teamId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberId: string) => removeTeamMember(teamId!, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.all });
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

async function fetchTeamInvites(teamId: string): Promise<TeamInvite[]> {
  const response = await fetch(`/api/teams/${teamId}/invites`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch invites");
  }
  return response.json();
}

async function createInvite(
  teamId: string,
  data: { role: Role; email?: string }
): Promise<CreatedInvite> {
  const response = await fetch(`/api/teams/${teamId}/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create invite");
  }
  return response.json();
}

async function revokeInvite(
  teamId: string,
  inviteId: string
): Promise<{ success: boolean }> {
  const response = await fetch(`/api/teams/${teamId}/invites/${inviteId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to revoke invite");
  }
  return response.json();
}

export function useTeamInvites(teamId: string | null) {
  return useQuery({
    queryKey: teamId ? teamKeys.invites(teamId) : [...teamKeys.all, "invites", "none"],
    queryFn: () => fetchTeamInvites(teamId!),
    enabled: !!teamId,
  });
}

export function useCreateInvite(teamId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { role: Role; email?: string }) =>
      createInvite(teamId!, data),
    onSuccess: () => {
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: teamKeys.invites(teamId) });
      }
    },
  });
}

export function useRevokeInvite(teamId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => revokeInvite(teamId!, inviteId),
    onSuccess: () => {
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: teamKeys.invites(teamId) });
      }
    },
  });
}
