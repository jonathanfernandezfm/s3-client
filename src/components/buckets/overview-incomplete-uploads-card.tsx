"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { useIncompleteUploads } from "@/lib/queries/multipart-uploads";

interface OverviewIncompleteUploadsCardProps {
  connectionId: string;
  bucket: string;
}

export function OverviewIncompleteUploadsCard({
  connectionId,
  bucket,
}: OverviewIncompleteUploadsCardProps) {
  const { data: uploads, isLoading, isError } = useIncompleteUploads(
    connectionId,
    bucket,
  );
  const count = uploads?.length ?? 0;

  const multipartHref = `/buckets/${connectionId}/${encodeURIComponent(
    bucket,
  )}?tab=multipart`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-muted-foreground" />
          Incomplete uploads
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking for incomplete uploads…
          </div>
        )}
        {isError && (
          <p className="text-sm text-muted-foreground">
            Failed to load incomplete uploads.
          </p>
        )}
        {!isLoading && !isError && count === 0 && (
          <p className="text-sm text-muted-foreground">
            No incomplete uploads.
          </p>
        )}
        {!isLoading && !isError && count > 0 && (
          <>
            <p className="text-sm">
              <span className="font-semibold">{count}</span> incomplete upload
              {count !== 1 ? "s" : ""}.
            </p>
            <Link
              href={multipartHref}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Review uploads
              <ArrowRight className="h-3 w-3" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
