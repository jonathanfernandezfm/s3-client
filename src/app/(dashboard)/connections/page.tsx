"use client";

import { useEffect, useState } from "react";
import { ConnectionForm } from "@/components/connections/connection-form";
import { ConnectionList } from "@/components/connections/connection-list";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspaces } from "@/lib/queries/workspaces";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import type { ConnectionResponse } from "@/lib/queries/connections";

export default function ConnectionsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ConnectionResponse | null>(null);

  const { data: workspaces = [] } = useWorkspaces();
  const selectedWorkspaceId = useWorkspaceStore((s) => s.selectedWorkspaceId);
  const setSelectedWorkspaceId = useWorkspaceStore((s) => s.setSelectedWorkspaceId);

  useEffect(() => {
    const personal = workspaces.find((workspace) => workspace.type === "PERSONAL");
    if (personal && personal.id !== selectedWorkspaceId) {
      setSelectedWorkspaceId(personal.id);
    }
  }, [workspaces, selectedWorkspaceId, setSelectedWorkspaceId]);

  const handleAdd = () => {
    setEditingConnection(null);
    setDialogOpen(true);
  };

  const handleEdit = (connection: ConnectionResponse) => {
    setEditingConnection(connection);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingConnection(null);
  };

  return (
    <div className="space-y-6 flex-1 p-6 overflow-auto">
      <div>
        <h1 className="text-2xl font-bold">Personal Connections</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your private storage connections.
        </p>
      </div>

      <ConnectionList onAdd={handleAdd} onEdit={handleEdit} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>{editingConnection ? "Edit Connection" : "Add Connection"}</DialogTitle>
          </DialogHeader>
          <ConnectionForm
            connection={editingConnection || undefined}
            onSuccess={handleClose}
            onCancel={handleClose}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
