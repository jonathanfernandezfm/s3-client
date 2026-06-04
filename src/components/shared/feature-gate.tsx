"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTier } from "@/hooks/use-tier";
import { useUpgradeModalStore } from "@/lib/stores/upgrade-modal-store";
import type { GatedFeature } from "@/lib/subscriptions/gates";

interface FeatureGateProps {
  feature: GatedFeature;
  /** Display name shown in tooltip, e.g. "Share Links" */
  label: string;
  children: React.ReactNode;
}

export function FeatureGate({ feature, label, children }: FeatureGateProps) {
  const { can } = useTier();
  const openModal = useUpgradeModalStore((s) => s.open);

  if (can(feature)) return <>{children}</>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="relative inline-flex cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openModal();
            }}
          >
            <span className="pointer-events-none opacity-50">{children}</span>
            <span className="absolute -right-1 -top-1 rounded-full border border-blue-500/30 bg-blue-500/20 px-1 text-[8px] font-medium text-blue-400">
              PRO
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <p className="text-xs font-medium">{label} · PRO feature</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Upgrade for $4/mo →
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
