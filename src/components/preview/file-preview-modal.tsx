"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, RefreshCw, X, Link2 } from "lucide-react";
import { getPreviewKind } from "@/lib/utils";
import type { S3Object } from "@/types";
import { ShareDialog } from "@/components/shares/share-dialog";
import { FeatureGate } from "@/components/shared/feature-gate";

const ImagePreview = lazy(() => import("./renderers/image-preview"));
const TextPreview = lazy(() => import("./renderers/text-preview"));
const PdfPreview = lazy(() => import("./renderers/pdf-preview"));
const VideoPreview = lazy(() => import("./renderers/video-preview"));
const AudioPreview = lazy(() => import("./renderers/audio-preview"));
const UnsupportedPreview = lazy(() => import("./renderers/unsupported-preview"));

interface FilePreviewModalProps {
  object: S3Object | null;
  connectionId: string;
  bucket: string;
  onClose: () => void;
}

type UrlState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

export function FilePreviewModal({
  object,
  connectionId,
  bucket,
  onClose,
}: FilePreviewModalProps) {
  const [urlState, setUrlState] = useState<UrlState>({ status: "loading" });
  const [shareOpen, setShareOpen] = useState(false);

  const fetchUrl = async (obj: S3Object) => {
    setUrlState({ status: "loading" });
    try {
      const response = await fetch("/api/objects/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, bucket, key: obj.key }),
      });
      if (!response.ok) throw new Error("Failed to load preview");
      const { url } = await response.json();
      setUrlState({ status: "ready", url });
    } catch (err) {
      setUrlState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to load preview",
      });
    }
  };

  useEffect(() => {
    if (!object || object.isFolder) return;
    fetchUrl(object);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object, bucket, connectionId]);

  const fileName = object?.key.split("/").pop() || "Preview";
  const kind = object ? getPreviewKind(object.key) : null;

  const rendererFallback = (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <>
    <Dialog open={!!object} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="truncate">{fileName}</DialogTitle>
            <div className="flex items-center gap-2 flex-shrink-0">
              {urlState.status === "ready" && (
                <Button variant="outline" size="icon" asChild>
                  <a href={urlState.url} target="_blank" rel="noreferrer">
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {object && !object.isFolder && (
                <FeatureGate feature="shareLinks" label="Share Links">
                  <Button variant="outline" size="icon" onClick={() => setShareOpen(true)}>
                    <Link2 className="h-4 w-4" />
                  </Button>
                </FeatureGate>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden min-h-[400px]">
          {urlState.status === "loading" && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Loading preview…</p>
            </div>
          )}

          {urlState.status === "error" && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-destructive">
              <X className="h-8 w-8" />
              <p className="text-sm">{urlState.message}</p>
              {object && (
                <Button variant="outline" size="sm" onClick={() => fetchUrl(object)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              )}
            </div>
          )}

          {urlState.status === "ready" && (
            <Suspense fallback={rendererFallback}>
              {kind === "image" && (
                <ImagePreview presignedUrl={urlState.url} filename={fileName} />
              )}
              {kind === "text" && (
                <TextPreview presignedUrl={urlState.url} filename={fileName} />
              )}
              {kind === "pdf" && (
                <PdfPreview presignedUrl={urlState.url} filename={fileName} />
              )}
              {kind === "video" && (
                <VideoPreview presignedUrl={urlState.url} filename={fileName} />
              )}
              {kind === "audio" && (
                <AudioPreview presignedUrl={urlState.url} filename={fileName} />
              )}
              {kind === null && (
                <UnsupportedPreview filename={fileName} presignedUrl={urlState.url} />
              )}
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
    {shareOpen && object && !object.isFolder && (
      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        connectionId={connectionId}
        bucket={bucket}
        fileKey={object.key}
      />
    )}
    </>
  );
}
