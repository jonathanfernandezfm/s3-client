"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface RendererProps {
  presignedUrl: string;
  filename: string;
}

export default function PdfPreview({ presignedUrl, filename }: RendererProps) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <p className="text-sm">Could not render PDF in browser.</p>
        <Button variant="outline" size="sm" asChild>
          <a href={presignedUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in new tab
          </a>
        </Button>
      </div>
    );
  }

  return (
    <iframe
      src={presignedUrl}
      className="w-full h-[80vh] border-0 rounded"
      title={filename}
      onError={() => setError(true)}
    />
  );
}
