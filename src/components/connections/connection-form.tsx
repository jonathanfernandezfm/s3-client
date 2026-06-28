"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useCreateConnection,
  useUpdateConnection,
  type ConnectionResponse,
  type ConnectionInput,
} from "@/lib/queries/connections";
import { useWorkspaces } from "@/lib/queries/workspaces";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface ConnectionFormProps {
  connection?: ConnectionResponse;
  defaultWorkspaceId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ConnectionForm({
  connection,
  defaultWorkspaceId,
  onSuccess,
  onCancel,
}: ConnectionFormProps) {
  const createConnection = useCreateConnection();
  const updateConnection = useUpdateConnection();
  const { addNotification } = useNotificationStore();
  const { data: workspaces = [] } = useWorkspaces();

  const adminWorkspaces = workspaces.filter((w) => w.role === "ADMIN");
  const personalWorkspace = adminWorkspaces.find((w) => w.type === "PERSONAL");
  const defaultWsId =
    defaultWorkspaceId ??
    personalWorkspace?.id ??
    adminWorkspaces[0]?.id ??
    undefined;

  const [formData, setFormData] = useState<ConnectionInput>({
    name: connection?.name || "",
    endpoint: connection?.endpoint || "",
    accessKeyId: connection?.accessKeyId || "",
    secretAccessKey: connection?.secretAccessKey || "",
    region: connection?.region || "us-east-1",
    forcePathStyle: connection?.forcePathStyle ?? true,
    workspaceId: defaultWsId,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!formData.workspaceId && defaultWsId) {
      setFormData((prev) => ({ ...prev, workspaceId: defaultWsId }));
    }
  }, [defaultWsId, formData.workspaceId]);

  const isEditMode = !!connection;
  const isSaving = createConnection.isPending || updateConnection.isPending;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setTestResult(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setTestResult({ success: true });
        addNotification({
          type: "info",
          title: "Connection successful",
          description: "Successfully connected to the S3 endpoint.",
          status: "completed",
        });
      } else {
        setTestResult({ success: false, error: data.error });
        addNotification({
          type: "error",
          title: "Connection failed",
          error: data.error || "Failed to connect to the S3 endpoint.",
          status: "error",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setTestResult({ success: false, error: message });
      addNotification({
        type: "error",
        title: "Connection failed",
        error: message,
        status: "error",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (isEditMode) {
        await updateConnection.mutateAsync({
          id: connection.id,
          data: formData,
        });
        addNotification({
          type: "info",
          title: "Connection updated",
          description: "Connection settings have been saved.",
          status: "completed",
        });
      } else {
        await createConnection.mutateAsync(formData);
        addNotification({
          type: "info",
          title: "Connection added",
          description: "New connection has been saved.",
          status: "completed",
        });
      }

      onSuccess?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save connection";
      addNotification({
        type: "error",
        title: "Error",
        error: message,
        status: "error",
      });
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>
          {isEditMode ? "Edit Connection" : "New Connection"}
        </CardTitle>
        <CardDescription>
          Configure your S3-compatible storage endpoint
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEditMode && adminWorkspaces.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="workspaceId">Workspace</Label>
              <select
                id="workspaceId"
                name="workspaceId"
                value={formData.workspaceId ?? ""}
                onChange={handleChange}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              >
                {adminWorkspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} ({ws.type === "PERSONAL" ? "Personal" : "Team"})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Connection Name (optional)</Label>
            <Input
              id="name"
              name="name"
              placeholder="My S3 Server"
              value={formData.name}
              onChange={handleChange}
              tabIndex={0}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endpoint">Endpoint URL</Label>
            <Input
              id="endpoint"
              name="endpoint"
              placeholder="https://s3.amazonaws.com"
              value={formData.endpoint}
              onChange={handleChange}
              required
              tabIndex={0}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="region">Region</Label>
            <Input
              id="region"
              name="region"
              placeholder="us-east-1"
              value={formData.region}
              onChange={handleChange}
              required
              tabIndex={0}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accessKeyId">Access Key ID</Label>
            <Input
              id="accessKeyId"
              name="accessKeyId"
              placeholder="AKIAIOSFODNN7EXAMPLE"
              value={formData.accessKeyId}
              onChange={handleChange}
              required
              tabIndex={0}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="secretAccessKey">Secret Access Key</Label>
            <Input
              id="secretAccessKey"
              name="secretAccessKey"
              type="password"
              placeholder="••••••••••••••••"
              value={formData.secretAccessKey}
              onChange={handleChange}
              required={!isEditMode}
              tabIndex={0}
            />
            {isEditMode && (
              <p className="text-xs text-muted-foreground">
                Leave blank to keep the existing secret key
              </p>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <input
              id="forcePathStyle"
              name="forcePathStyle"
              type="checkbox"
              checked={formData.forcePathStyle}
              onChange={handleChange}
              className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Label htmlFor="forcePathStyle" className="text-sm font-normal">
              Force path style (required for MinIO, etc.)
            </Label>
          </div>

          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={testConnection}
              disabled={testing || isSaving}
            >
              {testing && <Loader2 className="h-4 w-4 animate-spin" />}
              Test Connection
            </Button>

            {testResult?.success && (
              <div className="flex items-center text-green-600">
                <CheckCircle2 className="mr-1 h-4 w-4" />
                <span className="text-sm">Success</span>
              </div>
            )}

            {testResult && !testResult.success && (
              <div className="flex items-center text-red-600">
                <XCircle className="mr-1 h-4 w-4" />
                <span className="text-sm">Failed</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-4">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" className="flex-1" disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditMode ? "Save Changes" : "Add Connection"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
