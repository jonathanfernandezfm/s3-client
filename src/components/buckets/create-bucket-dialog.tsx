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
import { toast } from "@/hooks/use-toast";
import { Plus, Loader2 } from "lucide-react";

export function CreateBucketDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const createBucket = useCreateBucket();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    try {
      await createBucket.mutateAsync(name.trim());
      toast({
        title: "Bucket created",
        description: `Successfully created bucket "${name}"`,
      });
      setName("");
      setOpen(false);
    } catch (error) {
      toast({
        title: "Failed to create bucket",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
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
