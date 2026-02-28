"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCreateBucket } from "@/lib/queries/buckets";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { Plus, Loader2 } from "lucide-react";

interface CreateBucketDialogProps {
  connectionId: string;
  disabled?: boolean;
}

export function CreateBucketDialog({ connectionId, disabled = false }: CreateBucketDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const createBucket = useCreateBucket(connectionId);
  const { addNotification } = useNotificationStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    try {
      await createBucket.mutateAsync(name.trim());
      addNotification({
        type: "info",
        title: "Bucket created",
        description: `Successfully created bucket "${name}"`,
        status: "completed",
      });
      setName("");
      setOpen(false);
    } catch (error) {
      addNotification({
        type: "error",
        title: "Failed to create bucket",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <Plus className="mr-2 h-4 w-4" />
          Create Bucket
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Bucket</DialogTitle>
            <DialogDescription>
              Enter a name for your new S3 bucket. Bucket names must be globally
              unique and follow S3 naming conventions.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="bucket-name">Bucket Name</Label>
            <Input
              id="bucket-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-bucket-name"
              className="mt-2"
              pattern="[a-z0-9][a-z0-9.-]*[a-z0-9]"
              title="Bucket names must start and end with a letter or number, and can contain lowercase letters, numbers, hyphens, and periods."
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createBucket.isPending}>
              {createBucket.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
