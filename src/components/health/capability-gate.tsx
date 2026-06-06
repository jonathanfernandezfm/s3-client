// src/components/health/capability-gate.tsx
"use client";

import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCapability } from "@/lib/queries/health";
import type { CapabilityKey } from "@/lib/health/probe";

interface CapabilityGateProps {
  connectionId: string;
  bucket?: string;
  capability: CapabilityKey;
  children: ReactNode;
}

export function CapabilityGate({
  connectionId,
  bucket,
  capability,
  children,
}: CapabilityGateProps) {
  const { status, reason } = useCapability(connectionId, bucket, capability);

  if (status === "available" || status === "untested" || !reason) {
    return <>{children}</>;
  }

  // Disable the first child element and wrap with tooltip.
  const child = Children.only(children);
  const disabledChild = isValidElement(child)
    ? cloneElement(child as React.ReactElement<{ disabled?: boolean; "aria-disabled"?: boolean }>, {
        disabled: true,
        "aria-disabled": true,
      })
    : child;

  const reportHref = bucket
    ? `/buckets/${connectionId}/${encodeURIComponent(bucket)}/health`
    : `/connections/${connectionId}/health`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{disabledChild}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          <p>{reason}</p>
          <Link
            href={reportHref}
            className="mt-1 inline-block text-xs underline"
          >
            View permission report
          </Link>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
