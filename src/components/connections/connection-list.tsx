"use client";

import { useState } from "react";
import {
  useConnections,
  useDeleteConnection,
  type ConnectionResponse,
} from "@/lib/queries/connections";
import { useWorkspaces } from "@/lib/queries/workspaces";
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
} from "lucide-react";

interface ConnectionListProps {
  onAdd: () => void;
  onEdit: (connection: ConnectionResponse) => void;
}

export function ConnectionList({ onAdd, onEdit }: ConnectionListProps) {
  const { data: connections = [], isLoading } = useConnections();
  const { selectedWorkspace, isLoading: isLoadingWorkspaces } = useWorkspaces();
  const deleteConnection = useDeleteConnection();
  const { addNotification } = useNotificationStore();

  const [deletingConnection, setDeletingConnection] =
    useState<ConnectionResponse | null>(null);

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

  const getDisplayName = (connection: ConnectionResponse) => {
    return connection.name || connection.endpoint;
  };

  const canManage = (connection: ConnectionResponse) => connection.role === "ADMIN";
  const canAddConnection = selectedWorkspace?.role === "ADMIN";

  if (isLoading || isLoadingWorkspaces || !selectedWorkspace) {
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
        <Button onClick={onAdd} disabled={!canAddConnection}>
          <Plus className="mr-2 h-4 w-4" />
          Add Connection
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {connections.length} Connection{connections.length !== 1 ? "s" : ""}
        </h2>
        <Button onClick={onAdd} disabled={!canAddConnection}>
          <Plus className="mr-2 h-4 w-4" />
          Add Connection
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {connections.map((connection) => (
          <Card key={connection.id} className="p-3">
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
              {canManage(connection) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(connection)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setDeletingConnection(connection)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate pl-6">
              {connection.endpoint}
            </p>
          </Card>
        ))}
      </div>

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
            <Button variant="outline" onClick={() => setDeletingConnection(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteConnection.isPending}
            >
              {deleteConnection.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
