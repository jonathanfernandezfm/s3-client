"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, X, ZoomIn, ZoomOut } from "lucide-react";
import type { S3Object } from "@/types";

interface FilePreviewModalProps {
  object: S3Object | null;
  connectionId: string;
  bucket: string;
  onClose: () => void;
}

export function FilePreviewModal({
  object,
  connectionId,
  bucket,
  onClose,
}: FilePreviewModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!object || object.isFolder) {
      setImageUrl(null);
      return;
    }

    const loadImage = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/objects/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionId,
            bucket,
            key: object.key,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to load image");
        }

        const { url } = await response.json();
        setImageUrl(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load image");
      } finally {
        setLoading(false);
      }
    };

    loadImage();
    setZoom(1);
  }, [object, bucket, connectionId]);

  const handleDownload = () => {
    if (imageUrl) {
      window.open(imageUrl, "_blank");
    }
  };

  const fileName = object?.key.split("/").pop() || "Preview";

  return (
    <Dialog open={!!object} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="truncate pr-4">{fileName}</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                disabled={zoom <= 0.25}
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
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleDownload}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/50 rounded-lg min-h-[400px]">
          {loading && (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading preview...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-2 text-destructive">
              <X className="h-8 w-8" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {imageUrl && !loading && !error && (
            <img
              src={imageUrl}
              alt={fileName}
              className="max-w-full max-h-full object-contain transition-transform"
              style={{ transform: `scale(${zoom})` }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
