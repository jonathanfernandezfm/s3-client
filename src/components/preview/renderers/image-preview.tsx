"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, X, ZoomIn, ZoomOut } from "lucide-react";

interface RendererProps {
  presignedUrl: string;
  filename: string;
}

export default function ImagePreview({ presignedUrl, filename }: RendererProps) {
  const [zoom, setZoom] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-center gap-2 py-2 flex-shrink-0">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
          disabled={zoom <= 0.25}
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
          disabled={zoom >= 3}
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/50 rounded-lg relative">
        {!loaded && !error && (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {error ? (
          <div className="flex flex-col items-center gap-2 text-destructive">
            <X className="h-8 w-8" />
            <p className="text-sm">Failed to load image</p>
          </div>
        ) : (
          <img
            src={presignedUrl}
            alt={filename}
            className="w-full h-full object-contain transition-transform"
            style={{ transform: `scale(${zoom})`, display: loaded ? undefined : "none" }}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setError(true);
              setLoaded(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
