import { Archive, FileText, Film, Folder, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type FileKind = "folder" | "image" | "doc" | "archive" | "video";

export interface FileItem {
  name: string;
  kind: FileKind;
  highlighted?: boolean;
}

const ICONS: Record<FileKind, typeof Folder> = {
  folder: Folder,
  image: ImageIcon,
  doc: FileText,
  archive: Archive,
  video: Film,
};

export function FileGrid({
  items,
  className,
}: {
  items: FileItem[];
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-3 gap-2 p-3 sm:grid-cols-4", className)}>
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        return (
          <div
            key={item.name}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-lg border border-transparent p-3",
              item.highlighted &&
                "border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10"
            )}
          >
            <Icon
              className={cn(
                "size-6",
                item.kind === "folder"
                  ? "text-[var(--accent-amber)]/80"
                  : "text-white/40"
              )}
            />
            <span className="max-w-full truncate font-mono text-[10px] text-white/50">
              {item.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
