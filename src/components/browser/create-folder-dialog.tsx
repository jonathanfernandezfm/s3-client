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
import { useCreateFolder } from "@/lib/queries/objects";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { FolderPlus, Loader2 } from "lucide-react";

interface CreateFolderDialogProps {
  connectionId: string;
  bucket: string;
  currentPath: string;
  disabled?: boolean;
}

export function CreateFolderDialog({
  connectionId,
  bucket,
  currentPath,
  disabled = false,
}: CreateFolderDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const createFolder = useCreateFolder(connectionId, bucket);
  const { addNotification } = useNotificationStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    const folderPath = currentPath + name.trim() + "/";

    try {
      await createFolder.mutateAsync(folderPath);
      addNotification({
        type: "folder",
        title: "Folder created",
        description: `Successfully created folder "${name}"`,
        status: "completed",
      });
      setName("");
      setOpen(false);
    } catch (error) {
      addNotification({
        type: "folder",
        title: "Failed to create folder",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <FolderPlus className="mr-2 h-4 w-4" />
          New Folder
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="folder-name">Folder Name</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-folder"
              className="mt-2"
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
            <Button type="submit" disabled={createFolder.isPending}>
              {createFolder.isPending && (
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
