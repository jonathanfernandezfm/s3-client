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
  onDelete: (name: string) => void;
}

export function BucketCard({ bucket, onDelete }: BucketCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          {bucket.name}
        </CardTitle>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/browser/${bucket.name}`}>
                <FolderOpen className="mr-2 h-4 w-4" />
                Browse
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(bucket.name)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <Link
          href={`/browser/${bucket.name}`}
          className="block hover:underline"
        >
          <p className="text-xs text-muted-foreground">
            {bucket.creationDate
              ? `Created ${formatDate(bucket.creationDate)}`
              : "Creation date unknown"}
          </p>
        </Link>
      </CardContent>
    </Card>
  );
}
