"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import {
  useTeams,
  useTeam,
  useCreateTeam,
  useAddTeamMember,
  useUpdateTeamMemberRole,
  useRemoveTeamMember,
} from "@/lib/queries/teams";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { usePaletteIntentStore } from "@/lib/stores/palette-intent-store";
import { CreateTeamDialog } from "@/components/teams/create-team-dialog";
import { TeamMembersCard } from "@/components/teams/team-members-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useTier } from "@/hooks/use-tier";
import { LockedPageOverlay } from "@/components/billing/locked-page-overlay";
import type { Role } from "@/lib/roles";

function TeamsContent() {
  const { can, isLoading } = useTier();
  const { addNotification } = useNotificationStore();

  const { data: teams = [], isLoading: isLoadingTeams } = useTeams();
  const createTeam = useCreateTeam();

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedTeamId && teams.length > 0) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const intent = usePaletteIntentStore((s) => s.intent);
  const consumeIntent = usePaletteIntentStore((s) => s.consumeIntent);

  useEffect(() => {
    if (intent?.kind !== "create-team") return;
    consumeIntent();
    setCreateTeamOpen(true);
  }, [intent, consumeIntent]);

  const selectedTeamSummary = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [teams, selectedTeamId]
  );

  const { data: team, isLoading: isLoadingTeam } = useTeam(selectedTeamId);
  const addMember = useAddTeamMember(selectedTeamId);
  const updateRole = useUpdateTeamMemberRole(selectedTeamId);
  const removeMember = useRemoveTeamMember(selectedTeamId);

  const handleCreateTeam = async (data: { name: string; slug?: string }) => {
    try {
      const created = await createTeam.mutateAsync(data);
      setSelectedTeamId(created.id);
      addNotification({
        type: "info",
        title: "Team created",
        description: `${created.name} is ready.`,
        status: "completed",
      });
    } catch (error) {
      addNotification({
        type: "error",
        title: "Failed to create team",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
      throw error;
    }
  };

  const handleAddMember = async (data: {
    email: string;
    role: Role;
  }) => {
    try {
      await addMember.mutateAsync(data);
      addNotification({
        type: "info",
        title: "Member added",
        description: `${data.email} added as ${data.role}.`,
        status: "completed",
      });
    } catch (error) {
      addNotification({
        type: "error",
        title: "Failed to add member",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
    }
  };

  const handleUpdateRole = async (memberId: string, role: Role) => {
    try {
      await updateRole.mutateAsync({ memberId, role });
      addNotification({
        type: "info",
        title: "Role updated",
        description: `Member is now ${role}.`,
        status: "completed",
      });
    } catch (error) {
      addNotification({
        type: "error",
        title: "Failed to update role",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await removeMember.mutateAsync(memberId);
      addNotification({
        type: "delete",
        title: "Member removed",
        description: "Team member removed successfully.",
        status: "completed",
      });
    } catch (error) {
      addNotification({
        type: "error",
        title: "Failed to remove member",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
    }
  };

  if (isLoading) return null;
  if (!can("teams")) {
    return (
      <LockedPageOverlay
        feature="Teams"
        description="Create a shared workspace and invite colleagues to collaborate on your S3 connections."
      />
    );
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <aside className="w-80 border-r p-4 space-y-4 overflow-auto">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold">Teams</h1>
          <CreateTeamDialog
            open={createTeamOpen}
            onOpenChange={setCreateTeamOpen}
            onCreate={handleCreateTeam}
            isPending={createTeam.isPending}
          />
        </div>

        {isLoadingTeams ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : teams.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No teams yet. Create one to start sharing connections.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {teams.map((teamItem) => (
              <button
                key={teamItem.id}
                type="button"
                onClick={() => setSelectedTeamId(teamItem.id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  selectedTeamId === teamItem.id
                    ? "bg-accent border-accent"
                    : "hover:bg-muted/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate">{teamItem.name}</p>
                  <span className="text-xs text-muted-foreground">
                    {teamItem.role}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {teamItem.memberCount} member
                  {teamItem.memberCount !== 1 ? "s" : ""}
                </p>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="flex-1 p-6 overflow-auto space-y-6">
        {!selectedTeamSummary ? (
          <Card>
            <CardContent className="pt-6 text-muted-foreground">
              Select a team to manage members.
            </CardContent>
          </Card>
        ) : isLoadingTeam || !team ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">{team.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Role: {team.role}
                </p>
              </CardHeader>
            </Card>

            <TeamMembersCard
              team={team}
              canManage={team.role === "ADMIN"}
              isAdding={addMember.isPending}
              isUpdating={updateRole.isPending}
              isRemoving={removeMember.isPending}
              onAddMember={handleAddMember}
              onUpdateRole={handleUpdateRole}
              onRemoveMember={handleRemoveMember}
            />
          </>
        )}
      </section>
    </div>
  );
}

export default function TeamsPage() {
  return (
    <Suspense>
      <TeamsContent />
    </Suspense>
  );
}
