"use client";

import { Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagFilterBarProps {
  tags: string[];
  activeTag: string | null;
  onToggle: (tag: string) => void;
  onClear: () => void;
}

export function TagFilterBar({ tags, activeTag, onToggle, onClear }: TagFilterBarProps) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b text-xs">
      <Tag className="size-3 text-muted-foreground shrink-0" />
      {tags.map((tag) => (
        <button
          key={tag}
          onClick={() => onToggle(tag)}
          className={cn(
            "px-2 py-0.5 rounded-full border",
            activeTag === tag
              ? "border-primary bg-primary/15 text-primary"
              : "border-border hover:bg-accent text-foreground"
          )}
        >
          {tag}
        </button>
      ))}
      {activeTag && (
        <button
          onClick={onClear}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          aria-label="Clear tag filter"
        >
          <X className="size-3" />
          Clear
        </button>
      )}
    </div>
  );
}
