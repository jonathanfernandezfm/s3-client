"use client";

import { FileX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFileExtension } from "@/lib/utils";

interface Props {
  filename: string;
  presignedUrl?: string;
}

export default function UnsupportedPreview({ filename, presignedUrl }: Props) {
  const ext = getFileExtension(filename);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
      <FileX className="h-12 w-12" />
      <p className="text-sm">
        No preview available for {ext ? `.${ext}` : "this"} files.
      </p>
      {presignedUrl && (
        <Button variant="outline" size="sm" asChild>
          <a href={presignedUrl} download={filename} target="_blank" rel="noreferrer">
            Download
          </a>
        </Button>
      )}
    </div>
  );
}
