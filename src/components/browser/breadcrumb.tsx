"use client";

import Link from "next/link";
import { ChevronRight, Home, MoreHorizontal, Settings, Star } from "lucide-react";
import { useBookmarksForBucket, useCreateBookmark, useDeleteBookmark } from "@/lib/queries/bookmarks";
import { findBookmark } from "@/lib/bookmarks-helpers";

interface BreadcrumbProps {
  connectionId: string;
  bucket: string;
  path: string;
  onNavigate?: (path: string) => void;
  onGoHome?: () => void;
  maxVisibleItems?: number;
}

export function Breadcrumb({
  connectionId,
  bucket,
  path,
  onNavigate,
  onGoHome,
  maxVisibleItems = 3,
}: BreadcrumbProps) {
  const parts = path.split("/").filter(Boolean);
  const prefixBookmarks = useBookmarksForBucket(connectionId, bucket);
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();

  const buildPath = (index: number) => {
    const pathParts = parts.slice(0, index + 1);
    return pathParts.join("/") + "/";
  };

  const buildHref = (index: number) => {
    const pathParts = parts.slice(0, index + 1);
    return `/browser/${connectionId}/${bucket}/${pathParts.join("/")}`;
  };

  const handleClick = (e: React.MouseEvent, targetPath: string) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(targetPath);
    }
  };

  const handleHomeClick = (e: React.MouseEvent) => {
    if (onGoHome) {
      e.preventDefault();
      onGoHome();
    }
  };

  // Handle ellipsis click - go back one level
  const handleEllipsisClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (parts.length > 1 && onNavigate) {
      const parentPath = parts.slice(0, -1).join("/") + "/";
      onNavigate(parentPath);
    }
  };

  // Determine which parts to show
  const shouldCollapse = parts.length > maxVisibleItems;
  let visibleParts: { part: string; originalIndex: number }[] = [];

  if (shouldCollapse) {
    // Show first item, ellipsis, and last (maxVisibleItems - 1) items
    visibleParts = [
      { part: parts[0], originalIndex: 0 },
      ...parts.slice(-(maxVisibleItems - 1)).map((part, i) => ({
        part,
        originalIndex: parts.length - (maxVisibleItems - 1) + i,
      })),
    ];
  } else {
    visibleParts = parts.map((part, index) => ({ part, originalIndex: index }));
  }

  const currentPrefix = parts.length > 0 ? parts.join("/") + "/" : null;
  const pinnedFolder = currentPrefix
    ? findBookmark(prefixBookmarks, connectionId, bucket, currentPrefix)
    : null;
  const folderPinned = !!pinnedFolder;

  return (
    <div className="flex items-center gap-1.5 min-w-0">
    <nav className="flex items-center text-sm min-w-0 overflow-hidden">
      <Link
        href="/buckets"
        className="flex items-center hover:text-foreground text-muted-foreground shrink-0"
        onClick={handleHomeClick}
        title="Back to buckets"
      >
        <Home className="h-4 w-4" />
      </Link>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mx-1" />

      <Link
        href={`/browser/${connectionId}/${bucket}`}
        className={`hover:text-foreground truncate shrink-0 max-w-[120px] ${
          parts.length === 0 ? "font-medium" : "text-muted-foreground"
        }`}
        onClick={(e) => handleClick(e, "")}
        title={bucket}
      >
        {bucket}
      </Link>

      <Link
        href={`/buckets/${connectionId}/${encodeURIComponent(bucket)}?tab=multipart`}
        className="ml-1 p-1 rounded hover:bg-accent text-muted-foreground/60 hover:text-foreground shrink-0"
        title="Bucket settings"
        onClick={(e) => e.stopPropagation()}
      >
        <Settings className="h-3.5 w-3.5" />
      </Link>

      {shouldCollapse && (
        <>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mx-1" />
          <span className="text-muted-foreground truncate max-w-[150px]" title={parts[0]}>
            <Link
              href={buildHref(0)}
              className="hover:text-foreground"
              onClick={(e) => handleClick(e, buildPath(0))}
            >
              {parts[0]}
            </Link>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mx-1" />
          <button
            onClick={handleEllipsisClick}
            className="flex items-center hover:text-foreground text-muted-foreground hover:bg-muted px-1 py-0.5 rounded shrink-0"
            title="Go to parent folder"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {visibleParts.slice(1).map(({ part, originalIndex }, i) => (
            <div key={originalIndex} className="flex items-center min-w-0">
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mx-1" />
              <Link
                href={buildHref(originalIndex)}
                className={`hover:text-foreground truncate max-w-[150px] ${
                  originalIndex === parts.length - 1 ? "font-medium" : "text-muted-foreground"
                }`}
                onClick={(e) => handleClick(e, buildPath(originalIndex))}
                title={part}
              >
                {part}
              </Link>
            </div>
          ))}
        </>
      )}

      {!shouldCollapse &&
        parts.map((part, index) => (
          <div key={index} className="flex items-center min-w-0">
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mx-1" />
            <Link
              href={buildHref(index)}
              className={`hover:text-foreground truncate max-w-[150px] ${
                index === parts.length - 1 ? "font-medium" : "text-muted-foreground"
              }`}
              onClick={(e) => handleClick(e, buildPath(index))}
              title={part}
            >
              {part}
            </Link>
          </div>
        ))}
    </nav>
    {currentPrefix && (
      <button
        onClick={() => {
          if (folderPinned && pinnedFolder) deleteBookmark.mutate(pinnedFolder.id);
          else createBookmark.mutate({ connectionId, bucket, prefix: currentPrefix });
        }}
        className={`p-1 rounded hover:bg-accent shrink-0 ${folderPinned ? "text-yellow-400" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
        title={folderPinned ? "Unpin current folder" : "Pin current folder"}
      >
        <Star className="size-3.5" fill={folderPinned ? "currentColor" : "none"} />
      </button>
    )}
    </div>
  );
}
