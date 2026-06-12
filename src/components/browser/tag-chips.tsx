"use client";

import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagChipsProps {
  tags: string[];
  max?: number;
  activeTag?: string | null;
  onTagClick?: (tag: string) => void;
}

export function TagChips({ tags, max = 3, activeTag, onTagClick }: TagChipsProps) {
  if (tags.length === 0) return null;
  const visible = tags.slice(0, max);
  const overflow = tags.length - visible.length;

  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      {visible.map((tag) => (
        <button
          key={tag}
          type="button"
          disabled={!onTagClick}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTagClick?.(tag);
          }}
          title={`Tag: ${tag}`}
          className={cn(
            "inline-flex max-w-[120px] items-center gap-0.5 rounded-full border px-1.5 text-[10px] leading-4",
            activeTag === tag
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-muted text-muted-foreground",
            onTagClick && "hover:bg-accent hover:text-foreground"
          )}
        >
          <Tag className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{tag}</span>
        </button>
      ))}
      {overflow > 0 && (
        <span
          className="text-[10px] text-muted-foreground"
          title={tags.slice(max).join(", ")}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}
