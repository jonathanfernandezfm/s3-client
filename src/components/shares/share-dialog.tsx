"use client";
import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Copy } from "lucide-react";
import {
  useShareLinks,
  useCreateShareLink,
  useRevokeShareLink,
  type ShareLinkResponse,
} from "@/lib/queries/share-links";
import { formatDate } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  bucket: string;
  fileKey: string;
};

const EXPIRY_OPTIONS = [
  { label: "1 hour", seconds: 60 * 60 },
  { label: "1 day", seconds: 60 * 60 * 24 },
  { label: "7 days", seconds: 60 * 60 * 24 * 7 },
  { label: "30 days", seconds: 60 * 60 * 24 * 30 },
  { label: "90 days", seconds: 60 * 60 * 24 * 90 },
  { label: "Never", seconds: 0 },
];

export function ShareDialog({ open, onOpenChange, connectionId, bucket, fileKey }: Props) {
  const existing = useShareLinks(connectionId, { bucket, key: fileKey });
  const create = useCreateShareLink();
  const revoke = useRevokeShareLink();

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expirySec, setExpirySec] = useState(EXPIRY_OPTIONS[2].seconds);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [useCap, setUseCap] = useState(false);
  const [maxUses, setMaxUses] = useState(5);
  const [message, setMessage] = useState("");
  const [created, setCreated] = useState<{ url: string; shareLink: ShareLinkResponse } | null>(null);

  const handleCopy = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
  }, []);

  function handleOpenChange(o: boolean) {
    onOpenChange(o);
    if (!o) {
      setCreated(null);
      setPassword("");
      setMessage("");
    }
  }

  async function handleCreate() {
    const result = await create.mutateAsync({
      connectionId,
      bucket,
      key: fileKey,
      expiresIn: expirySec > 0 ? expirySec : null,
      password: usePassword && password ? password : null,
      maxUses: useCap ? maxUses : null,
      description: message.trim() || null,
    });
    setCreated(result);
  }

  const filename = fileKey.split("/").pop();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share {filename}</DialogTitle>
          <DialogDescription>
            {bucket} / {fileKey}
          </DialogDescription>
        </DialogHeader>

        {existing.data && existing.data.length > 0 && (
          <div className="border rounded-md divide-y">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Existing shares ({existing.data.length})
            </div>
            {existing.data.map((s) => (
              <div key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs text-muted-foreground">
                    {s.createdByDisplayName} · {s.useCount} views
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      s.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                      s.status === "revoked" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      "bg-muted text-muted-foreground"
                    }`}>{s.status}</span>
                    {s.expiresAt && (
                      <span className="text-xs text-muted-foreground">
                        expires {formatDate(s.expiresAt)}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-[88px] text-xs gap-1"
                  onClick={() => handleCopy(s.id, `${window.location.origin}/s/${s.slug}`)}
                >
                  {copiedId === s.id ? (
                    <><Check className="h-3 w-3" />Copied</>
                  ) : (
                    <><Copy className="h-3 w-3" />Copy link</>
                  )}
                </Button>
                {s.status === "active" && (
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
            ))}
          </div>
        )}

        {!created ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Expires</Label>
              <select
                value={expirySec}
                onChange={(e) => setExpirySec(Number(e.target.value))}
                className="w-full h-9"
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.label} value={o.seconds}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="use-password"
                  checked={usePassword}
                  onChange={(e) => setUsePassword(e.target.checked)}
                />
                <Label htmlFor="use-password" className="font-normal cursor-pointer">
                  Password protect
                </Label>
              </div>
              {usePassword && (
                <Input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                />
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="use-cap"
                  checked={useCap}
                  onChange={(e) => setUseCap(e.target.checked)}
                />
                <Label htmlFor="use-cap" className="font-normal cursor-pointer">
                  Limit downloads
                </Label>
                {useCap && (
                  <Input
                    type="number"
                    min={1}
                    value={maxUses}
                    onChange={(e) => setMaxUses(Number(e.target.value))}
                    className="h-7 w-20 text-xs"
                  />
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Message <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a note for the recipient"
                rows={2}
                className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <Button
              onClick={handleCreate}
              disabled={create.isPending}
              className="w-full"
            >
              {create.isPending ? "Creating…" : "Create share link"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Share link created successfully.</p>
            <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
              <code className="flex-1 text-xs truncate">{created.url}</code>
              <Button
                size="sm"
                className="w-[72px] gap-1"
                onClick={() => handleCopy("created", created.url)}
              >
                {copiedId === "created" ? (
                  <><Check className="h-3 w-3" />Copied</>
                ) : (
                  <><Copy className="h-3 w-3" />Copy</>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">0 views so far.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
