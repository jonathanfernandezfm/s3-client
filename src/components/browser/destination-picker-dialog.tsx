"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConnections } from "@/lib/queries/connections";
import { useBuckets } from "@/lib/queries/buckets";

export interface Destination {
  connectionId: string;
  bucket: string;
  path: string; // "" for root, or a prefix ending in "/"
}

interface DestinationPickerDialogProps {
  open: boolean;
  mode: "copy" | "move";
  count: number;
  defaultConnectionId: string;
  defaultBucket: string;
  onCancel: () => void;
  onConfirm: (dest: Destination) => void;
}

export function DestinationPickerDialog({
  open,
  mode,
  count,
  defaultConnectionId,
  defaultBucket,
  onCancel,
  onConfirm,
}: DestinationPickerDialogProps) {
  const [connectionId, setConnectionId] = useState(defaultConnectionId);
  const [bucket, setBucket] = useState(defaultBucket);
  const [path, setPath] = useState("");

  // useConnections returns a TanStack Query result; .data is ConnectionResponse[]
  const { data: connections = [] } = useConnections();
  // useBuckets returns a TanStack Query result; .data is S3Bucket[] (each has .name)
  const { data: buckets = [], isLoading: bucketsLoading } = useBuckets(connectionId);

  function handleConnectionChange(newConnectionId: string) {
    setConnectionId(newConnectionId);
    // Reset bucket when connection changes so the user picks from the new list
    if (newConnectionId !== connectionId) {
      setBucket("");
    }
  }

  const normalizedPath =
    path.trim() === ""
      ? ""
      : path.trim().replace(/^\/+/, "").replace(/\/*$/, "/");

  const canConfirm = !!connectionId && !!bucket;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "copy" ? "Copy" : "Move"} {count} item{count !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Choose a destination connection, bucket, and folder. Leave the folder
            blank to place items at the bucket root.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <Label className="flex flex-col gap-1">
            Connection
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={connectionId}
              onChange={(e) => handleConnectionChange(e.target.value)}
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.endpoint}
                </option>
              ))}
            </select>
          </Label>

          <Label className="flex flex-col gap-1">
            Bucket
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              disabled={bucketsLoading || !connectionId}
            >
              <option value="">
                {bucketsLoading ? "Loading buckets…" : "Select a bucket…"}
              </option>
              {buckets.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </Label>

          <Label className="flex flex-col gap-1">
            Folder (optional)
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="e.g. archive/2024/"
            />
          </Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!canConfirm}
            onClick={() => onConfirm({ connectionId, bucket, path: normalizedPath })}
          >
            {mode === "copy" ? "Copy here" : "Move here"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
