// src/components/health/capability-row.tsx
"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Minus,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CapabilityReport, CapabilityStatus } from "@/lib/health/probe";
import { cn } from "@/lib/utils";

function StatusIcon({ status }: { status: CapabilityStatus }) {
  switch (status) {
    case "available":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "unavailable":
      return <XCircle className="h-4 w-4 text-destructive" />;
    case "unsupported":
      return <Minus className="h-4 w-4 text-muted-foreground" />;
    case "untested":
      return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    default:
      return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

function statusLabel(status: CapabilityStatus): string {
  switch (status) {
    case "available":
      return "Available";
    case "unavailable":
      return "Unavailable";
    case "unsupported":
      return "Not supported by this provider";
    case "untested":
      return "Untested";
    default:
      return "Unknown";
  }
}

interface CapabilityRowProps {
  capability: CapabilityReport;
  defaultOpen?: boolean;
  onFix?: () => void;
  isFixing?: boolean;
  fixError?: string;
}

export function CapabilityRow({
  capability,
  defaultOpen = false,
  onFix,
  isFixing,
  fixError,
}: CapabilityRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const showDetails = capability.status !== "available";

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/50"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <StatusIcon status={capability.status} />
        <span className="flex-1 text-sm font-medium">{capability.label}</span>
        <span
          className={cn(
            "text-xs",
            capability.status === "unavailable" && "text-destructive",
            capability.status === "available" && "text-muted-foreground",
            capability.status === "untested" && "text-yellow-700",
          )}
        >
          {statusLabel(capability.status)}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pl-9 space-y-2 text-sm">
          {capability.status === "unavailable" && capability.fixAction && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {capability.probes[0]?.errorCode === "not_configured"
                  ? "No CORS rules are configured on this bucket."
                  : "CORS rules exist but none allow PUT with ETag exposed."}
              </p>
              {onFix && (
                <div className="space-y-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onFix}
                    disabled={isFixing}
                  >
                    {isFixing ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Applying…
                      </>
                    ) : (
                      "Fix"
                    )}
                  </Button>
                  {fixError && (
                    <p className="text-xs text-destructive">{fixError}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {showDetails && capability.requiredIamActions.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Required IAM actions
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-muted px-2 py-0.5 text-xs">
                  {capability.requiredIamActions.join(", ")}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      capability.requiredIamActions.join("\n"),
                    )
                  }
                  title="Copy IAM actions"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {capability.status !== "untested" && capability.affects.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Affects
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                {capability.affects.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {capability.probes.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Probe details
              </div>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {capability.probes.map((p) => (
                  <li key={p.key}>
                    <code>{p.key}</code> → {p.result}
                    {p.errorCode ? ` (${p.errorCode})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
