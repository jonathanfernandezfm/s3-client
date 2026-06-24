"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useTeams,
  useTeam,
  useCreateTeam,
  useAddTeamMember,
  useUpdateTeamMemberRole,
  useRemoveTeamMember,
  useRenameTeam,
  useDeleteTeam,
  useLeaveTeam,
  useTeamInvites,
  useCreateInvite,
  useRevokeInvite,
  type CreatedInvite,
} from "@/lib/queries/teams";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { usePaletteIntentStore } from "@/lib/stores/palette-intent-store";
import { CreateTeamDialog } from "@/components/teams/create-team-dialog";
import { TeamMembersCard } from "@/components/teams/team-members-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MoreVertical, Pencil, Trash2, LogOut } from "lucide-react";
import { useTier } from "@/hooks/use-tier";
import { LockedPageOverlay } from "@/components/billing/locked-page-overlay";
import type { Role } from "@/lib/roles";

function TeamsContent() {
  const { can, isLoading } = useTier();
  const { addNotification } = useNotificationStore();

  const { data: teams = [], isLoading: isLoadingTeams } = useTeams();
  const createTeam = useCreateTeam();
  const searchParams = useSearchParams();
  const workspaceParam = searchParams.get("workspace");
  const handledWorkspaceRef = useRef<string | null>(null);

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (!teams.length) return;
    if (workspaceParam && handledWorkspaceRef.current !== workspaceParam) {
      const match = teams.find((t) => t.workspaceId === workspaceParam);
      if (match) {
        handledWorkspaceRef.current = workspaceParam;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern; auto-select from URL param is intentional
        setSelectedTeamId(match.id);
        return;
      }
    }
    if (!selectedTeamId) {
       
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId, workspaceParam]);

  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const intent = usePaletteIntentStore((s) => s.intent);
  const consumeIntent = usePaletteIntentStore((s) => s.consumeIntent);

  useEffect(() => {
    if (intent?.kind !== "create-team") return;
    consumeIntent();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern; processing palette intent in effect is intentional, real fix tracked separately
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
  const renameTeam = useRenameTeam(selectedTeamId);
  const deleteTeam = useDeleteTeam();
  const leaveTeam = useLeaveTeam(selectedTeamId);
  const { data: invites = [] } = useTeamInvites(
    team?.role === "ADMIN" ? selectedTeamId : null
  );
  const createInvite = useCreateInvite(selectedTeamId);
  const revokeInvite = useRevokeInvite(selectedTeamId);

  // Rename dialog state
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");

  // Delete confirmation state
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Leave confirmation state
  const [leaveOpen, setLeaveOpen] = useState(false);

  const handleCreateTeam = async (data: { name: string }) => {
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

  const handleRenameOpen = () => {
    setRenameName(team?.name ?? "");
    setRenameOpen(true);
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameName.trim()) return;
    try {
      await renameTeam.mutateAsync(renameName.trim());
      setRenameOpen(false);
      addNotification({
        type: "info",
        title: "Team renamed",
        description: `Team is now called "${renameName.trim()}".`,
        status: "completed",
      });
    } catch (error) {
      addNotification({
        type: "error",
        title: "Failed to rename team",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedTeamId) return;
    try {
      await deleteTeam.mutateAsync(selectedTeamId);
      setDeleteOpen(false);
      setSelectedTeamId(null);
      addNotification({
        type: "delete",
        title: "Team deleted",
        description: "The team and all its connections have been permanently deleted.",
        status: "completed",
      });
    } catch (error) {
      addNotification({
        type: "error",
        title: "Failed to delete team",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
    }
  };

  const handleCreateInvite = async (data: { role: Role }): Promise<CreatedInvite> => {
    try {
      const created = await createInvite.mutateAsync(data);
      addNotification({
        type: "info",
        title: "Invite link created",
        description: "Share the link with your colleague.",
        status: "completed",
      });
      return created;
    } catch (error) {
      addNotification({
        type: "error",
        title: "Failed to create invite link",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
      throw error;
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await revokeInvite.mutateAsync(inviteId);
      addNotification({
        type: "delete",
        title: "Invite revoked",
        description: "The invite link has been revoked.",
        status: "completed",
      });
    } catch (error) {
      addNotification({
        type: "error",
        title: "Failed to revoke invite",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
    }
  };

  const handleLeaveConfirm = async () => {
    if (!team || !selectedTeamId) return;
    try {
      await leaveTeam.mutateAsync(team.currentMemberId);
      setLeaveOpen(false);
      setSelectedTeamId(null);
      addNotification({
        type: "delete",
        title: "Left team",
        description: "You have left the team.",
        status: "completed",
      });
    } catch (error) {
      setLeaveOpen(false);
      addNotification({
        type: "error",
        title: "Failed to leave team",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
    }
  };

  const handleCopyInviteUrl = (_url: string) => {
    addNotification({
      type: "info",
      title: "Link copied",
      description: "Invite link copied to clipboard.",
      status: "completed",
    });
  };

  if (isLoading) return null;
  if (!can("teams")) {
    return (
      <LockedPageOverlay
        feature="Teams"
        description="Create a shared workspace and invite colleagues to collaborate on your S3 instances."
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
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-2xl">{team.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Role: {team.role}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Team actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {team.role === "ADMIN" && (
                        <DropdownMenuItem onClick={handleRenameOpen}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename team
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setLeaveOpen(true)}
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Leave team
                      </DropdownMenuItem>
                      {team.role === "ADMIN" && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteOpen(true)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete team
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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
              invites={invites}
              isCreatingInvite={createInvite.isPending}
              isRevokingInvite={revokeInvite.isPending}
              onCreateInvite={handleCreateInvite}
              onRevokeInvite={handleRevokeInvite}
              onCopyUrl={handleCopyInviteUrl}
            />
          </>
        )}
      </section>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <form onSubmit={handleRenameSubmit}>
            <DialogHeader>
              <DialogTitle>Rename team</DialogTitle>
              <DialogDescription>
                Enter a new name for this team.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="rename-team-name">Team name</Label>
              <Input
                id="rename-team-name"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder="Platform Team"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={renameTeam.isPending}>
                {renameTeam.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete team</DialogTitle>
            <DialogDescription>
              This permanently deletes the team and all its connections. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteTeam.isPending}
            >
              {deleteTeam.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave confirmation dialog */}
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave team</DialogTitle>
            <DialogDescription>
              Are you sure you want to leave this team? You will lose access to the team&apos;s shared connections.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleLeaveConfirm}
              disabled={leaveTeam.isPending}
            >
              {leaveTeam.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Leave team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
