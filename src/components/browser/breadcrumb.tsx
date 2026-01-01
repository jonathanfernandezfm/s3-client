"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbProps {
  connectionId: string;
  bucket: string;
  path: string;
}

export function Breadcrumb({ connectionId, bucket, path }: BreadcrumbProps) {
  const parts = path.split("/").filter(Boolean);

  const buildPath = (index: number) => {
    const pathParts = parts.slice(0, index + 1);
    return `/browser/${connectionId}/${bucket}/${pathParts.join("/")}`;
  };

  return (
    <nav className="flex items-center space-x-1 text-sm">
      <Link
        href={`/browser/${connectionId}/${bucket}`}
        className="flex items-center hover:text-foreground text-muted-foreground"
      >
        <Home className="h-4 w-4" />
      </Link>

      <ChevronRight className="h-4 w-4 text-muted-foreground" />

      <Link
        href={`/browser/${connectionId}/${bucket}`}
        className={`hover:text-foreground ${
          parts.length === 0 ? "font-medium" : "text-muted-foreground"
        }`}
      >
        {bucket}
      </Link>

      {parts.map((part, index) => (
        <div key={index} className="flex items-center space-x-1">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <Link
            href={buildPath(index)}
            className={`hover:text-foreground ${
              index === parts.length - 1 ? "font-medium" : "text-muted-foreground"
            }`}
          >
            {part}
          </Link>
        </div>
      ))}
    </nav>
  );
}
