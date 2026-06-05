"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Database, MoreVertical, Trash2, FolderOpen, Star, Settings, History } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import type { S3Bucket } from "@/types";
import { useBookmarks, useCreateBookmark, useDeleteBookmark } from "@/lib/queries/bookmarks";
import { isBookmarked, findBookmark } from "@/lib/bookmarks-helpers";
import { useBucketVersioning } from "@/lib/queries/buckets";

interface BucketCardProps {
  bucket: S3Bucket;
  connectionId: string;
  connectionName?: string;
  onDelete: (name: string) => void;
  onOpen?: (connectionId: string, connectionName: string, bucketName: string) => void;
  canDelete?: boolean;
}

export function BucketCard({
  bucket,
  connectionId,
  connectionName,
  onDelete,
  onOpen,
  canDelete = true,
}: BucketCardProps) {
  const browserUrl = `/browser/${connectionId}/${bucket.name}`;

  const { data: bookmarks = [] } = useBookmarks();
  const router = useRouter();
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const pinned = isBookmarked(bookmarks, connectionId, bucket.name, null);
  const versioning = useBucketVersioning(connectionId, bucket.name);
  const enabled = versioning.data?.status === "Enabled";

  const handleClick = (e: React.MouseEvent) => {
    if (onOpen) {
      e.preventDefault();
      onOpen(connectionId, connectionName || "", bucket.name);
    }
  };

  const handleBrowse = (e: React.MouseEvent) => {
    if (onOpen) {
      e.preventDefault();
      onOpen(connectionId, connectionName || "", bucket.name);
    }
  };

  return (
    <Link href={browserUrl} className="block" onClick={handleClick}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2 min-w-0 flex-1">
            <Database className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate">{bucket.name}</span>
            {enabled && (
              <span title="Versioning enabled" className="inline-flex ml-1.5 align-middle">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (pinned) {
                  const existing = findBookmark(bookmarks, connectionId, bucket.name, null);
                  if (existing) deleteBookmark.mutate(existing.id);
                } else {
                  createBookmark.mutate({ connectionId, bucket: bucket.name, prefix: null });
                }
              }}
              className={`p-1 rounded hover:bg-accent ${pinned ? "text-yellow-400" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
              title={pinned ? "Unpin" : "Pin"}
            >
              <Star className="size-4" fill={pinned ? "currentColor" : "none"} />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleBrowse}>
                  <FolderOpen className="h-4 w-4" />
                  Browse
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (pinned) {
                      const existing = findBookmark(bookmarks, connectionId, bucket.name, null);
                      if (existing) deleteBookmark.mutate(existing.id);
                    } else {
                      createBookmark.mutate({ connectionId, bucket: bucket.name, prefix: null });
                    }
                  }}
                >
                  <Star className="h-4 w-4" fill={pinned ? "currentColor" : "none"} />
                  {pinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push(
                      `/buckets/${connectionId}/${encodeURIComponent(bucket.name)}?tab=multipart`
                    );
                  }}
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                {canDelete && (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      onDelete(bucket.name);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {bucket.creationDate
              ? `Created ${formatDate(bucket.creationDate)}`
              : "Creation date unknown"}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
