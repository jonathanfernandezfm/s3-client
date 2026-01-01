"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteBucket } from "@/lib/queries/buckets";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface DeleteBucketDialogProps {
  bucketName: string | null;
  connectionId: string | null;
  onClose: () => void;
}

export function DeleteBucketDialog({
  bucketName,
  connectionId,
  onClose,
}: DeleteBucketDialogProps) {
  const deleteBucket = useDeleteBucket(connectionId || "");

  const handleDelete = async () => {
    if (!bucketName || !connectionId) return;

    try {
      await deleteBucket.mutateAsync(bucketName);
      toast({
        title: "Bucket deleted",
        description: `Successfully deleted bucket "${bucketName}"`,
      });
      onClose();
    } catch (error) {
      toast({
        title: "Failed to delete bucket",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={!!bucketName && !!connectionId} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Bucket</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the bucket &quot;{bucketName}&quot;?
            This action cannot be undone. The bucket must be empty before it can
            be deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteBucket.isPending}
          >
            {deleteBucket.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
