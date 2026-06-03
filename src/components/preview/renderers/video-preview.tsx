"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { getFileExtension } from "@/lib/utils";

interface RendererProps {
  presignedUrl: string;
  filename: string;
}

export default function VideoPreview({ presignedUrl, filename }: RendererProps) {
  const [error, setError] = useState(false);

  if (error) {
    const ext = getFileExtension(filename);
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <p className="text-sm">This browser can&apos;t play .{ext} files.</p>
        <Button variant="outline" size="sm" asChild>
          <a href={presignedUrl} download={filename} target="_blank" rel="noreferrer">
            <Download className="h-4 w-4 mr-2" />
            Download
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center bg-black rounded overflow-hidden">
      <video
        src={presignedUrl}
        controls
        className="max-w-full max-h-[80vh] mx-auto"
        onError={() => setError(true)}
      />
    </div>
  );
}
