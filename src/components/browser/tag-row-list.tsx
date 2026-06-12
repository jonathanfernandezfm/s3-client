"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TagRow } from "@/lib/tags";

interface TagRowListProps {
  rows: TagRow[];
  onUpdate: (id: string, patch: Partial<TagRow>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
  validationError?: string | null;
}

export function TagRowList({ rows, onUpdate, onAdd, onRemove, disabled, validationError }: TagRowListProps) {
  return (
    <div className="space-y-2 py-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <Input
            placeholder="Key"
            value={row.key}
            disabled={disabled}
            onChange={(e) => onUpdate(row.id, { key: e.target.value })}
          />
          <Input
            placeholder="Value"
            value={row.value}
            disabled={disabled}
            onChange={(e) => onUpdate(row.id, { value: e.target.value })}
          />
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemove(row.id)}
              disabled={rows.length === 1}
              aria-label="Remove tag"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add tag
        </Button>
      )}
      {validationError && (
        <p className="text-sm text-destructive">{validationError}</p>
      )}
    </div>
  );
}
