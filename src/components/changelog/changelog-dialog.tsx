"use client";

import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ChangelogEntry } from "@/app/api/changelog/route";

interface ChangelogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangelogDialog({ open, onOpenChange }: ChangelogDialogProps) {
  const { data, isLoading } = useQuery<{ entries: ChangelogEntry[] }>({
    queryKey: ["changelog"],
    queryFn: async () => {
      const res = await fetch("/api/changelog");
      if (!res.ok) throw new Error("Failed to fetch changelog");
      return res.json();
    },
    enabled: open,
    staleTime: Infinity,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Changelog</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-8 pr-1">
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          {!isLoading && !data?.entries.length && (
            <p className="text-sm text-muted-foreground">No changelog entries yet.</p>
          )}

          {data?.entries.map((entry) => (
            <section key={entry.slug} className="pb-8 border-b last:border-0 last:pb-0">
              <div className="flex items-baseline gap-3 mb-4">
                <time
                  dateTime={entry.date}
                  className="text-xs font-medium text-muted-foreground tabular-nums"
                >
                  {entry.date}
                </time>
              </div>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-base font-semibold text-foreground mb-3 mt-0">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-sm font-semibold text-foreground mb-2 mt-5">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-medium text-foreground mb-2 mt-4">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside text-sm text-muted-foreground mb-3 space-y-1 ml-1">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-inside text-sm text-muted-foreground mb-3 space-y-1 ml-1">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="text-sm text-muted-foreground leading-relaxed">
                      {children}
                    </li>
                  ),
                  code: ({ children }) => (
                    <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono text-foreground">
                      {children}
                    </code>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-foreground">{children}</strong>
                  ),
                  em: ({ children }) => (
                    <em className="italic text-muted-foreground">{children}</em>
                  ),
                  hr: () => <hr className="border-border my-4" />,
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2 hover:opacity-80"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {entry.content}
              </ReactMarkdown>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
