"use client";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/components/info-drawer/format-time";
import { formatNumber } from "@/lib/utils";
import { useTier } from "@/hooks/use-tier";
import { useUpgradeModalStore } from "@/lib/stores/upgrade-modal-store";
import {
  useSearchIndexStatus,
  useTriggerSearchIndex,
} from "@/lib/queries/search-index";

interface ConnectionIndexingCardProps {
  connectionId: string;
}

export function ConnectionIndexingCard({
  connectionId,
}: ConnectionIndexingCardProps) {
  const { tier, isLoading: tierLoading } = useTier();
  const openUpgrade = useUpgradeModalStore((s) => s.open);
  const { data, isLoading } = useSearchIndexStatus(connectionId);
  const trigger = useTriggerSearchIndex();

  // Locked variant — FREE tier upsell
  if (!tierLoading && tier === "FREE") {
    return (
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            Global search
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col flex-1">
          <p className="text-sm text-muted-foreground mb-4">
            Index your S3 contents to search across all buckets and connections
            from the command palette.
          </p>
          <Button size="sm" onClick={openUpgrade} className="self-start">
            <Sparkles className="h-3.5 w-3.5" />
            Upgrade to PRO
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Wait for status before deciding between hidden / empty / running / done / failed
  if (isLoading || !data) return null;

  // Hidden variant — env flag off
  if (data.state === "disabled") return null;

  const header = (
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-sm">
        <Search className="h-5 w-5 text-muted-foreground" />
        Search index
      </CardTitle>
    </CardHeader>
  );

  // Empty variant — never crawled
  if (data.state === "none") {
    return (
      <Card className="flex flex-col">
        {header}
        <CardContent className="flex flex-col flex-1">
          <p className="text-sm text-muted-foreground mb-4">
            This connection hasn&apos;t been indexed yet. Indexing scans all
            buckets so files appear in the command palette search.
          </p>
          <Button
            size="sm"
            disabled={trigger.isPending}
            onClick={() => trigger.mutate(connectionId)}
            className="self-start"
          >
            {trigger.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <Search className="h-3.5 w-3.5" />
                Index now
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Running variant — crawl in progress
  if (data.state === "indexing") {
    return (
      <Card className="flex flex-col">
        {header}
        <CardContent className="flex flex-col flex-1 gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="font-medium">
              Indexing… {formatNumber(data.indexed)} objects
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            You can leave this page — it&apos;ll keep running.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Done variants — ready or partial (2M cap)
  if (data.state === "ready" || data.state === "partial") {
    const isPartial = data.state === "partial";
    const lastReconciledAt =
      data.state === "ready" ? data.lastReconciledAt : null;
    return (
      <Card className="flex flex-col">
        {header}
        <CardContent className="flex flex-col flex-1 items-center justify-center text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
          <p className="text-sm font-semibold mb-1">
            {formatNumber(data.indexed)} objects indexed
            {isPartial ? " · 2M cap reached" : ""}
          </p>
          {isPartial ? (
            <p className="text-xs text-amber-600">
              Only the first 2M objects are searchable on this connection.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {lastReconciledAt
                ? `Last refreshed ${formatRelativeTime(lastReconciledAt)}`
                : "Just finished."}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Failed variant — error block
  if (data.state === "failed") {
    return (
      <Card className="flex flex-col">
        {header}
        <CardContent className="flex flex-col flex-1">
          <div className="bg-destructive/5 border border-destructive/40 rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">
                Indexing failed
              </span>
            </div>
            <p className="font-mono text-xs break-words">{data.message}</p>
            <p className="text-xs text-muted-foreground">
              This usually means credentials lost access to a bucket — check
              the Permissions tab.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
