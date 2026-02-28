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
import { Database, MoreVertical, Trash2, FolderOpen } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { S3Bucket } from "@/types";

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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            {bucket.name}
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleBrowse}>
                <FolderOpen className="mr-2 h-4 w-4" />
                Browse
              </DropdownMenuItem>
              {canDelete && (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => {
                    e.preventDefault();
                    onDelete(bucket.name);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
