"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useTeams,
  useTeam,
  useCreateTeam,
  useAddTeamMember,
  useUpdateTeamMemberRole,
  useRemoveTeamMember,
} from "@/lib/queries/teams";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { CreateTeamDialog } from "@/components/teams/create-team-dialog";
import { TeamMembersCard } from "@/components/teams/team-members-card";
import { ConnectionList } from "@/components/connections/connection-list";
import { ConnectionForm } from "@/components/connections/connection-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ConnectionResponse } from "@/lib/queries/connections";
import { Loader2, FolderOpen } from "lucide-react";

export default function TeamsPage() {
  const router = useRouter();
  const setSelectedWorkspaceId = useWorkspaceStore((s) => s.setSelectedWorkspaceId);
  const { addNotification } = useNotificationStore();

  const { data: teams = [], isLoading: isLoadingTeams } = useTeams();
  const createTeam = useCreateTeam();

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ConnectionResponse | null>(null);

  useEffect(() => {
    if (!selectedTeamId && teams.length > 0) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  const selectedTeamSummary = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [teams, selectedTeamId]
  );

  const { data: team, isLoading: isLoadingTeam } = useTeam(selectedTeamId);
  const addMember = useAddTeamMember(selectedTeamId);
  const updateRole = useUpdateTeamMemberRole(selectedTeamId);
  const removeMember = useRemoveTeamMember(selectedTeamId);

  useEffect(() => {
    if (team?.workspaceId) {
      setSelectedWorkspaceId(team.workspaceId);
    }
  }, [team?.workspaceId, setSelectedWorkspaceId]);

  const handleCreateTeam = async (data: { name: string; slug?: string }) => {
    try {
      const created = await createTeam.mutateAsync(data);
      setSelectedTeamId(created.id);
      setSelectedWorkspaceId(created.workspaceId);
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

  const handleAddMember = async (data: { email: string; role: "ADMIN" | "VIEWER" }) => {
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

  const handleUpdateRole = async (memberId: string, role: "ADMIN" | "VIEWER") => {
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

  const handleAddConnection = () => {
    setEditingConnection(null);
    setConnectionDialogOpen(true);
  };

  const handleEditConnection = (connection: ConnectionResponse) => {
    setEditingConnection(connection);
    setConnectionDialogOpen(true);
  };

  const handleConnectionDialogClose = () => {
    setConnectionDialogOpen(false);
    setEditingConnection(null);
  };

  const openTeamBuckets = () => {
    if (team?.workspaceId) {
      setSelectedWorkspaceId(team.workspaceId);
      router.push("/buckets");
    }
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <aside className="w-80 border-r p-4 space-y-4 overflow-auto">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold">Teams</h1>
          <CreateTeamDialog onCreate={handleCreateTeam} isPending={createTeam.isPending} />
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
                onClick={() => {
                  setSelectedTeamId(teamItem.id);
                  setSelectedWorkspaceId(teamItem.workspaceId);
                }}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  selectedTeamId === teamItem.id
                    ? "bg-accent border-accent"
                    : "hover:bg-muted/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate">{teamItem.name}</p>
                  <span className="text-xs text-muted-foreground">{teamItem.role}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {teamItem.memberCount} member{teamItem.memberCount !== 1 ? "s" : ""}
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
              Select a team to manage members and shared connections.
            </CardContent>
          </Card>
        ) : isLoadingTeam || !team ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">{team.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Role: {team.role}</p>
                </div>
                <Button variant="outline" onClick={openTeamBuckets}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Open Buckets
                </Button>
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

            <Card>
              <CardHeader>
                <CardTitle>Team Connections</CardTitle>
              </CardHeader>
              <CardContent>
                <ConnectionList onAdd={handleAddConnection} onEdit={handleEditConnection} />
              </CardContent>
            </Card>

            <Dialog open={connectionDialogOpen} onOpenChange={setConnectionDialogOpen}>
              <DialogContent className="sm:max-w-md p-0 overflow-hidden">
                <DialogHeader className="sr-only">
                  <DialogTitle>{editingConnection ? "Edit Team Connection" : "Add Team Connection"}</DialogTitle>
                </DialogHeader>
                <ConnectionForm
                  connection={editingConnection || undefined}
                  onSuccess={handleConnectionDialogClose}
                  onCancel={handleConnectionDialogClose}
                />
              </DialogContent>
            </Dialog>
          </>
        )}
      </section>
    </div>
  );
}
