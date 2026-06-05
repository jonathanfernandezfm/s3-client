"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ConnectionForm } from "@/components/connections/connection-form";
import { ConnectionList } from "@/components/connections/connection-list";
import { ImportAwsProfileDialog } from "@/components/connections/import-aws-profile-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ConnectionResponse } from "@/lib/queries/connections";
import { usePaletteIntentStore } from "@/lib/stores/palette-intent-store";

function ConnectionsPageContent() {
  const searchParams = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] =
    useState<ConnectionResponse | null>(null);
  const [defaultWorkspaceId, setDefaultWorkspaceId] = useState<
    string | undefined
  >(undefined);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importDefaultWorkspaceId, setImportDefaultWorkspaceId] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    const wsId = searchParams.get("workspaceId");
    if (wsId) {
      setDefaultWorkspaceId(wsId);
      setEditingConnection(null);
      setDialogOpen(true);
    }
  }, [searchParams]);

  const consumeIntent = usePaletteIntentStore((s) => s.consumeIntent);
  const intent = usePaletteIntentStore((s) => s.intent);

  useEffect(() => {
    if (intent?.kind !== "create-connection") return;
    consumeIntent();
    setDefaultWorkspaceId(intent.workspaceId);
    setEditingConnection(null);
    setDialogOpen(true);
  }, [intent, consumeIntent]);

  const handleImport = (workspaceId?: string) => {
    setImportDefaultWorkspaceId(workspaceId);
    setImportDialogOpen(true);
  };

  const handleAdd = (workspaceId?: string) => {
    setDefaultWorkspaceId(workspaceId);
    setEditingConnection(null);
    setDialogOpen(true);
  };

  const handleEdit = (connection: ConnectionResponse) => {
    setEditingConnection(connection);
    setDefaultWorkspaceId(undefined);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingConnection(null);
    setDefaultWorkspaceId(undefined);
  };

  return (
    <div className="space-y-6 flex-1 p-6 overflow-auto">
      <div>
        <h1 className="text-2xl font-bold">Connections</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your S3 storage connections across all workspaces.
        </p>
      </div>

      <ConnectionList onAdd={handleAdd} onEdit={handleEdit} onImport={handleImport} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {editingConnection ? "Edit Connection" : "Add Connection"}
            </DialogTitle>
          </DialogHeader>
          <ConnectionForm
            connection={editingConnection || undefined}
            defaultWorkspaceId={defaultWorkspaceId}
            onSuccess={handleClose}
            onCancel={handleClose}
          />
        </DialogContent>
      </Dialog>

      <ImportAwsProfileDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        defaultWorkspaceId={importDefaultWorkspaceId}
      />
    </div>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense>
      <ConnectionsPageContent />
    </Suspense>
  );
}
