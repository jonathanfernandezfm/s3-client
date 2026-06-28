"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Copy, Link, Loader2, MoreVertical, Pencil, Plus, Shield, Trash2, User } from "lucide-react";
import type { TeamDetail, TeamInvite, CreatedInvite } from "@/lib/queries/teams";
import type { Role } from "@/lib/roles";

interface TeamMembersCardProps {
  team: TeamDetail;
  canManage: boolean;
  isAdding: boolean;
  isUpdating: boolean;
  isRemoving: boolean;
  onAddMember: (data: { email: string; role: Role }) => Promise<void>;
  onUpdateRole: (memberId: string, role: Role) => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
  // Invite props (optional so the card degrades if not wired up)
  invites?: TeamInvite[];
  isCreatingInvite?: boolean;
  isRevokingInvite?: boolean;
  onCreateInvite?: (data: { role: Role }) => Promise<CreatedInvite>;
  onRevokeInvite?: (inviteId: string) => Promise<void>;
  onCopyUrl?: (url: string) => void;
}

function relativeExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "expired";
  if (days === 1) return "expires in 1 day";
  return `expires in ${days} days`;
}

export function TeamMembersCard({
  team,
  canManage,
  isAdding,
  isUpdating,
  isRemoving,
  onAddMember,
  onUpdateRole,
  onRemoveMember,
  invites = [],
  isCreatingInvite = false,
  isRevokingInvite = false,
  onCreateInvite,
  onRevokeInvite,
  onCopyUrl,
}: TeamMembersCardProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [inviteRole, setInviteRole] = useState<Role>("VIEWER");
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    await onAddMember({ email: email.trim(), role });
    setEmail("");
    setRole("VIEWER");
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateInvite) return;
    const created = await onCreateInvite({ role: inviteRole });
    setCreatedInviteUrl(created.url);
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      onCopyUrl?.(url);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          {team.members.length} member{team.members.length !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <form onSubmit={handleAdd} className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_140px_auto]">
            <div className="space-y-2 min-w-0">
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="text-sm"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-role">Role</Label>
              <select
                id="member-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              >
                <option value="VIEWER">Viewer</option>
                <option value="EDITOR">Editor</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="self-end">
              <Button type="submit" disabled={isAdding} className="h-9">
                {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add
              </Button>
            </div>
          </form>
        )}

        {canManage && onCreateInvite && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Create invite link</p>
            <form onSubmit={handleCreateInvite} className="flex items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="invite-role" className="text-xs">
                  Role
                </Label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  className="flex h-9 w-32 rounded-md border border-input bg-background px-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="EDITOR">Editor</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <Button type="submit" variant="outline" disabled={isCreatingInvite} className="h-9">
                {isCreatingInvite ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link className="h-4 w-4" />
                )}
                Generate
              </Button>
            </form>

            {createdInviteUrl && (
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={createdInviteUrl}
                  className="text-xs font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => handleCopyLink(createdInviteUrl)}
                >
                  <Copy className="h-4 w-4" />
                  <span className="sr-only">Copy invite link</span>
                </Button>
              </div>
            )}

            {invites.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Pending invites</p>
                {invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{invite.role}</span>
                      {invite.email && (
                        <span className="ml-1 text-muted-foreground">
                          ({invite.email})
                        </span>
                      )}
                      <span className="ml-1 text-muted-foreground">
                        &mdash; {relativeExpiry(invite.expiresAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleCopyLink(invite.url)}
                      >
                        <Copy className="h-3 w-3" />
                        <span className="sr-only">Copy invite link</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        disabled={isRevokingInvite}
                        onClick={() => onRevokeInvite?.(invite.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                        <span className="sr-only">Revoke invite</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          {team.members.map((member) => {
            const name = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email;
            const roleIcon =
              member.role === "ADMIN" ? (
                <Shield className="h-3 w-3" />
              ) : member.role === "EDITOR" ? (
                <Pencil className="h-3 w-3" />
              ) : (
                <User className="h-3 w-3" />
              );

            return (
              <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{name}</p>
                  <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs text-muted-foreground">
                    {roleIcon}
                    {member.role}
                  </span>

                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => onUpdateRole(member.id, "ADMIN")}
                          disabled={member.role === "ADMIN" || isUpdating}
                        >
                          Make Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onUpdateRole(member.id, "EDITOR")}
                          disabled={member.role === "EDITOR" || isUpdating}
                        >
                          Make Editor
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onUpdateRole(member.id, "VIEWER")}
                          disabled={member.role === "VIEWER" || isUpdating}
                        >
                          Make Viewer
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => onRemoveMember(member.id)}
                          disabled={isRemoving}
                        >
                          Remove Member
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
