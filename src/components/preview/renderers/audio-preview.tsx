"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { getFileExtension } from "@/lib/utils";

interface RendererProps {
  presignedUrl: string;
  filename: string;
}

export default function AudioPreview({ presignedUrl, filename }: RendererProps) {
  const [error, setError] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      {error ? (
        <>
          <p className="text-sm text-muted-foreground">
            This browser can&apos;t play .{getFileExtension(filename)} files.
          </p>
          <Button variant="outline" size="sm" asChild>
            <a href={presignedUrl} download={filename} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4 mr-2" />
              Download
            </a>
          </Button>
        </>
      ) : (
        <audio
          src={presignedUrl}
          controls
          className="w-full max-w-md"
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}
