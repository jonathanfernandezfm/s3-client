import { Sparkles } from "lucide-react";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { HighlightMatches } from "./highlight-matches";
import { FileIcon } from "./file-icon";
import type { SearchResponse, SearchResult } from "@/lib/queries/search";

function basename(key: string): string {
  const stripped = key.endsWith("/") ? key.slice(0, -1) : key;
  const i = stripped.lastIndexOf("/");
  return i < 0 ? stripped : stripped.slice(i + 1);
}

function dirname(key: string): string {
  const i = key.lastIndexOf("/");
  return i < 0 ? "" : key.slice(0, i);
}

function formatBytes(bytesStr: string): string {
  const n = Number(bytesStr);
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const day = 86_400_000;
  if (diff < day) return "today";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return d.toISOString().slice(0, 10);
}

export function SearchResultsGroup({
  query,
  data,
  isLoading,
  isError,
  onSelectFile,
  onSelectFolder,
  showLockedTeaser,
  onUpgradeClick,
}: {
  query: string;
  data: SearchResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onSelectFile: (r: SearchResult) => void;
  onSelectFolder: (r: SearchResult) => void;
  showLockedTeaser: boolean;
  onUpgradeClick: () => void;
}) {
  if (showLockedTeaser && query.trim().length >= 2) {
    return (
      <CommandGroup heading="Files">
        <CommandItem value={`teaser-${query}`} forceMount onSelect={onUpgradeClick}>
          <span className="flex h-5 w-5 items-center justify-center">
            <Sparkles className="h-4 w-4 text-yellow-500" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">Search across all your files</span>
            <span className="truncate text-xs text-muted-foreground">PRO feature · upgrade to enable</span>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">Upgrade →</span>
        </CommandItem>
      </CommandGroup>
    );
  }

  if (query.trim().length < 2) return null;
  if (isError) return null;

  const heading = data?.partial ? "Files · partial index" : "Files";

  if (isLoading && !data) {
    return (
      <CommandGroup heading={heading}>
        {[0, 1].map((i) => (
          <CommandItem key={`sk-${i}`} value={`${query} sk-${i}`} forceMount disabled>
            <div className="flex w-full animate-pulse items-center gap-2 py-1">
              <div className="h-4 w-4 rounded bg-muted" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-1/3 rounded bg-muted" />
                <div className="h-2 w-1/2 rounded bg-muted/60" />
              </div>
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    );
  }

  const results = data?.results ?? [];
  if (results.length === 0) {
    return (
      <CommandGroup heading={heading}>
        <CommandItem value={`${query} empty`} forceMount disabled>
          <span className="text-sm text-muted-foreground">No files match.</span>
        </CommandItem>
      </CommandGroup>
    );
  }

  return (
    <CommandGroup heading={heading}>
      {results.map((r) => {
        const isFolder = r.key.endsWith("/");
        const label = basename(r.key) || r.bucket;
        const subtitle = `${r.connectionName ?? "connection"} · ${r.bucket}${dirname(r.key) ? "/" + dirname(r.key) : ""}`;
        const tagValues = Array.isArray(r.tags)
          ? (r.tags as unknown[]).filter((t): t is string => typeof t === "string")
          : [];
        return (
          <CommandItem
            key={r.id}
            value={`${query} ${r.bucket} ${r.key} ${r.connectionName ?? ""}`}
            forceMount
            onSelect={() => (isFolder ? onSelectFolder(r) : onSelectFile(r))}
          >
            <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
              <FileIcon mime={r.mime} extension={r.extension} isFolder={isFolder} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">
                  <HighlightMatches text={label} query={data?.parsedQuery.freeText ?? ""} />
                </span>
                {tagValues.slice(0, 2).map((t) => (
                  <span
                    key={t}
                    className="shrink-0 rounded-full border border-border bg-muted px-1.5 text-[10px] leading-4 text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </span>
              <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
            </div>
            <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
              {formatBytes(r.size)} · {formatTime(r.lastModified)}
            </span>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
