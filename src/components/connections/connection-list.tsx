"use client";

import { useState } from "react";
import { useConnectionStore } from "@/lib/stores/connection-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  CheckCircle2,
  XCircle,
  MoreVertical,
  Pencil,
  Trash2,
  Plus,
  Server,
  Loader2,
} from "lucide-react";
import type { S3Connection } from "@/types";

interface ConnectionListProps {
  onAdd: () => void;
  onEdit: (connection: S3Connection) => void;
}

export function ConnectionList({ onAdd, onEdit }: ConnectionListProps) {
  const { connections, statuses, removeConnection, setStatus } =
    useConnectionStore();
  const [deletingConnection, setDeletingConnection] =
    useState<S3Connection | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const handleConnect = async (connection: S3Connection) => {
    setConnectingId(connection.id);
    try {
      const response = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connection),
      });

      const data = await response.json();

      if (data.success) {
        setStatus(connection.id, { connected: true, testedAt: new Date() });
      } else {
        setStatus(connection.id, { connected: false, error: data.error });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(connection.id, { connected: false, error: message });
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnect = (connectionId: string) => {
    setStatus(connectionId, { connected: false });
  };

  const handleDelete = () => {
    if (deletingConnection) {
      removeConnection(deletingConnection.id);
      setDeletingConnection(null);
    }
  };

  const getDisplayName = (connection: S3Connection) => {
    return connection.name || connection.endpoint;
  };

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Server className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No Connections</h3>
        <p className="text-muted-foreground mb-4">
          Add your first S3 connection to get started
        </p>
        <Button onClick={onAdd}>
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
        <Button onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Connection
        </Button>
      </div>

      <div className="grid gap-4">
        {connections.map((connection) => {
          const status = statuses[connection.id];
          const isConnecting = connectingId === connection.id;

          return (
            <Card key={connection.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  {getDisplayName(connection)}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {status?.connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(connection.id)}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConnect(connection)}
                      disabled={isConnecting}
                    >
                      {isConnecting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Connect
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
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
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {connection.endpoint}
                  </p>
                  <div className="flex items-center gap-1">
                    {status?.connected ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-xs text-green-600">Connected</span>
                      </>
                    ) : status?.error ? (
                      <>
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span className="text-xs text-red-600">Failed</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          Disconnected
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
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
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
