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
import { Loader2, MoreVertical, Pencil, Plus, Shield, User } from "lucide-react";
import type { TeamDetail } from "@/lib/queries/teams";
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
}: TeamMembersCardProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    await onAddMember({ email: email.trim(), role });
    setEmail("");
    setRole("VIEWER");
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
                className="h-9 w-full"
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
