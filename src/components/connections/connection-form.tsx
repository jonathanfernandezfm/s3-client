"use client";

import { useState } from "react";
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
import { useConnectionStore } from "@/lib/stores/connection-store";
import { toast } from "@/hooks/use-toast";
import type { S3Connection } from "@/types";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface ConnectionFormProps {
  connection?: S3Connection;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ConnectionForm({
  connection,
  onSuccess,
  onCancel,
}: ConnectionFormProps) {
  const { addConnection, updateConnection, setStatus } = useConnectionStore();
  const [formData, setFormData] = useState<Omit<S3Connection, "id">>({
    name: connection?.name || "",
    endpoint: connection?.endpoint || "",
    accessKeyId: connection?.accessKeyId || "",
    secretAccessKey: connection?.secretAccessKey || "",
    region: connection?.region || "us-east-1",
    forcePathStyle: connection?.forcePathStyle ?? true,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  const isEditMode = !!connection;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
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
        toast({
          title: "Connection successful",
          description: "Successfully connected to the S3 endpoint.",
        });
      } else {
        setTestResult({ success: false, error: data.error });
        toast({
          title: "Connection failed",
          description: data.error || "Failed to connect to the S3 endpoint.",
          variant: "destructive",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setTestResult({ success: false, error: message });
      toast({
        title: "Connection failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isEditMode) {
      updateConnection(connection.id, formData);
      toast({
        title: "Connection updated",
        description: "Connection settings have been saved.",
      });
    } else {
      const newConnection: S3Connection = {
        id: crypto.randomUUID(),
        ...formData,
      };
      addConnection(newConnection);

      if (testResult?.success) {
        setStatus(newConnection.id, { connected: true, testedAt: new Date() });
      }

      toast({
        title: "Connection added",
        description: "New connection has been saved.",
      });
    }

    onSuccess?.();
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
          <div className="space-y-2">
            <Label htmlFor="name">Connection Name (optional)</Label>
            <Input
              id="name"
              name="name"
              placeholder="My S3 Server"
              value={formData.name}
              onChange={handleChange}
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
              required
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              id="forcePathStyle"
              name="forcePathStyle"
              type="checkbox"
              checked={formData.forcePathStyle}
              onChange={handleChange}
              className="h-4 w-4 rounded border-gray-300"
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
              disabled={testing}
            >
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" className="flex-1">
              {isEditMode ? "Save Changes" : "Add Connection"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
