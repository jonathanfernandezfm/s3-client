"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useConnections,
  useDeleteConnection,
  type ConnectionResponse,
} from "@/lib/queries/connections";
import { useWorkspaces, type WorkspaceSummary } from "@/lib/queries/workspaces";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useNotificationStore } from "@/lib/stores/notification-store";
import {
  MoreVertical,
  Pencil,
  Trash2,
  Plus,
  Server,
  Loader2,
  Briefcase,
  Users,
  Settings,
} from "lucide-react";
import { SearchIndexStatus } from "./search-index-status";

interface ConnectionListProps {
  onAdd: (workspaceId?: string) => void;
  onEdit: (connection: ConnectionResponse) => void;
  onImport: (workspaceId?: string) => void;
}

export function ConnectionList({ onAdd, onEdit, onImport }: ConnectionListProps) {
  const router = useRouter();
  const { data: connections = [], isLoading } = useConnections();
  const { data: workspaces = [], isLoading: isLoadingWorkspaces } =
    useWorkspaces();
  const deleteConnection = useDeleteConnection();
  const { addNotification } = useNotificationStore();

  const [deletingConnection, setDeletingConnection] =
    useState<ConnectionResponse | null>(null);

  const workspaceGroups = useMemo(() => {
    const wsMap = new Map<
      string,
      { workspace: WorkspaceSummary; connections: ConnectionResponse[] }
    >();
    for (const ws of workspaces) {
      wsMap.set(ws.id, { workspace: ws, connections: [] });
    }
    for (const conn of connections) {
      const entry = wsMap.get(conn.workspaceId);
      if (entry) {
        entry.connections.push(conn);
      }
    }
    return Array.from(wsMap.values());
  }, [workspaces, connections]);

  const handleDelete = async () => {
    if (deletingConnection) {
      try {
        await deleteConnection.mutateAsync(deletingConnection.id);
        addNotification({
          type: "delete",
          title: "Connection deleted",
          description: "The connection has been removed.",
          status: "completed",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete connection";
        addNotification({
          type: "error",
          title: "Error",
          error: message,
          status: "error",
        });
      } finally {
        setDeletingConnection(null);
      }
    }
  };

  const getDisplayName = (connection: ConnectionResponse) =>
    connection.name || connection.endpoint;

  const canManage = (connection: ConnectionResponse) =>
    connection.role === "ADMIN";

  if (isLoading || isLoadingWorkspaces) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Server className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No Connections</h3>
        <p className="text-muted-foreground mb-4">
          Add your first S3 connection to get started
        </p>
        <div className="flex gap-2">
          <Button onClick={() => onAdd()}>
            <Plus className="h-4 w-4" />
            Add Connection
          </Button>
          <Button variant="outline" onClick={() => onImport()}>
            Import from AWS profile
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {workspaceGroups.map(({ workspace, connections: wsConns }) => {
        if (wsConns.length === 0 && workspace.role !== "ADMIN") return null;
        const canAdd = workspace.role === "ADMIN";
        return (
          <div key={workspace.id} className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                {workspace.type === "TEAM" ? (
                  <Users className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Briefcase className="h-5 w-5 text-muted-foreground" />
                )}
                <h2 className="text-lg font-semibold">{workspace.name}</h2>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded px-1.5 py-0.5">
                  {workspace.role}
                </span>
              </div>
              {canAdd && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => onAdd(workspace.id)}>
                    <Plus className="h-4 w-4" />
                    Add Connection
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onImport(workspace.id)}>
                    Import from AWS profile
                  </Button>
                </div>
              )}
            </div>

            {wsConns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center border rounded-lg border-dashed">
                <p className="text-sm text-muted-foreground mb-3">
                  No connections yet
                </p>
                {canAdd && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAdd(workspace.id)}
                  >
                    <Plus className="h-4 w-4" />
                    Add Connection
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {wsConns.map((connection) => (
                  <Card
                    key={connection.id}
                    id={`connection-${connection.id}`}
                    className="p-3 cursor-pointer transition-colors hover:bg-accent/50"
                    onClick={() => router.push(`/app/connections/${connection.id}?tab=overview`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">
                          {getDisplayName(connection)}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded px-1.5 py-0.5">
                          {connection.role}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          asChild
                        >
                          <Link href={`/app/connections/${connection.id}?tab=overview`}>
                            <Settings className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        {canManage(connection) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => onEdit(connection)}
                              >
                                <Pencil className="h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeletingConnection(connection)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate pl-6">
                      {connection.endpoint}
                    </p>
                    <div className="mt-2 pl-6">
                      <SearchIndexStatus connectionId={connection.id} />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <Dialog
        open={!!deletingConnection}
        onOpenChange={() => setDeletingConnection(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Connection</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;
              {deletingConnection && getDisplayName(deletingConnection)}
              &quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingConnection(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteConnection.isPending}
            >
              {deleteConnection.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
