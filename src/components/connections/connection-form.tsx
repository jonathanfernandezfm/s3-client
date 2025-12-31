"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConnectionStore } from "@/lib/stores/connection-store";
import { toast } from "@/hooks/use-toast";
import type { S3Connection } from "@/types";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export function ConnectionForm() {
  const { connection, status, setConnection, setStatus } = useConnectionStore();
  const [formData, setFormData] = useState<S3Connection>({
    endpoint: connection?.endpoint || "",
    accessKeyId: connection?.accessKeyId || "",
    secretAccessKey: connection?.secretAccessKey || "",
    region: connection?.region || "us-east-1",
    forcePathStyle: connection?.forcePathStyle ?? true,
  });
  const [testing, setTesting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const response = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setStatus({ connected: true, testedAt: new Date() });
        setConnection(formData);
        toast({
          title: "Connection successful",
          description: "Successfully connected to the S3 endpoint.",
        });
      } else {
        setStatus({ connected: false, error: data.error });
        toast({
          title: "Connection failed",
          description: data.error || "Failed to connect to the S3 endpoint.",
          variant: "destructive",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus({ connected: false, error: message });
      toast({
        title: "Connection failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    testConnection();
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>S3 Connection</CardTitle>
        <CardDescription>
          Configure your S3-compatible storage endpoint
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Button type="submit" disabled={testing}>
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {testing ? "Testing..." : "Connect"}
            </Button>

            {status.connected && (
              <div className="flex items-center text-green-600">
                <CheckCircle2 className="mr-1 h-4 w-4" />
                <span className="text-sm">Connected</span>
              </div>
            )}

            {!status.connected && status.error && (
              <div className="flex items-center text-red-600">
                <XCircle className="mr-1 h-4 w-4" />
                <span className="text-sm">Failed</span>
              </div>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
