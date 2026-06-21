"use client";
import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useShareLinks, useRevokeShareLink, useEditShareLink, type ShareLinkResponse } from "@/lib/queries/share-links";
import { formatDate } from "@/lib/utils";
import { canCopyShare, canExtendShare, canRevokeShare, EXTEND_BY_MS } from "@/lib/share-links/row-actions";

const STATUS_CLASSES: Record<ShareLinkResponse["status"], string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  expired: "bg-muted text-muted-foreground",
  exhausted: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  revoked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function ShareListTable({ connectionId }: { connectionId: string }) {
  const { data, isLoading } = useShareLinks(connectionId);
  const revoke = useRevokeShareLink();
  const edit = useEditShareLink();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
  }, []);

  if (isLoading)
    return <div className="text-sm text-muted-foreground py-4">Loading…</div>;

  if (!data || data.length === 0)
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">No share links yet.</p>
      </div>
    );

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Bucket</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Uses</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Created by</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="max-w-xs truncate font-medium">{s.key}</TableCell>
              <TableCell className="text-muted-foreground">{s.bucket}</TableCell>
              <TableCell>
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASSES[s.status]}`}>
                  {s.status}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {s.useCount}{s.maxUses ? ` / ${s.maxUses}` : ""}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {s.expiresAt ? formatDate(s.expiresAt) : "Never"}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">{s.createdByDisplayName}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {canCopyShare(s.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-[72px] gap-1 text-xs"
                      onClick={() => handleCopy(s.id, `${window.location.origin}/s/${s.slug}`)}
                    >
                      {copiedId === s.id ? (
                        <><Check className="h-3 w-3 text-green-600" /><span className="text-green-600">Copied</span></>
                      ) : (
                        <><Copy className="h-3 w-3" />Copy</>
                      )}
                    </Button>
                  )}
                  {canExtendShare(s.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={edit.isPending}
                      onClick={() =>
                        edit.mutate({
                          id: s.id,
                          patch: { expiresAt: new Date(Date.now() + EXTEND_BY_MS).toISOString() },
                        })
                      }
                    >
                      Extend
                    </Button>
                  )}
                  {canRevokeShare(s.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => revoke.mutate(s.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
