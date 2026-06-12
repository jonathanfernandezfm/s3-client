"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { useUpgradeModalStore } from "@/lib/stores/upgrade-modal-store";
import { track } from "@/lib/analytics";
import { useTier } from "@/hooks/use-tier";
import { PLAN_DISPLAYS } from "@/lib/subscriptions/plan-display";

interface PlansModalProps {
  /** When provided, the modal is controlled externally (e.g. from BillingTab). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PlansModal({ open: controlledOpen, onOpenChange }: PlansModalProps = {}) {
  const { isOpen: storeOpen, close } = useUpgradeModalStore();
  const isOpen = controlledOpen ?? storeOpen;
  const { tier } = useTier();
  const [loading, setLoading] = useState(false);

  function handleOpenChange(val: boolean) {
    onOpenChange?.(val);
    if (!val) close();
  }

  async function handleUpgrade() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        track({ name: "checkout_initiated" });
        close();
        window.location.href = data.url;
      }
    } finally {
      setLoading(false);
    }
  }

  const freePlan = PLAN_DISPLAYS.find((p) => p.id === "free")!;
  const proPlan = PLAN_DISPLAYS.find((p) => p.id === "pro")!;
  const enterprisePlan = PLAN_DISPLAYS.find((p) => p.id === "enterprise")!;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose your plan</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Simple pricing, cancel anytime.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4 pt-2">
          {/* FREE */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Free
            </p>
            <p className="mt-1 text-2xl font-bold">{freePlan.price}</p>
            <p className="text-xs text-muted-foreground">forever</p>
            <div className="mt-4 space-y-1.5 border-t pt-4">
              {freePlan.features.map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="h-3 w-3 shrink-0 text-green-500" />
                  {f}
                </div>
              ))}
              {(freePlan.missing ?? []).map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground/50">
                  <X className="h-3 w-3 shrink-0" />
                  {f}
                </div>
              ))}
            </div>
            <Button variant="secondary" className="mt-4 w-full" disabled>
              {tier === "FREE" ? "Current plan" : "Downgrade"}
            </Button>
          </div>

          {/* PRO */}
          <div className="relative rounded-lg border border-blue-500/50 bg-blue-500/5 p-4">
            <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px]">
              POPULAR
            </Badge>
            <p className="text-xs font-medium uppercase tracking-widest text-blue-400">
              Pro
            </p>
            <p className="mt-1 text-2xl font-bold">{proPlan.price}</p>
            <p className="text-xs text-muted-foreground">per month</p>
            <div className="mt-4 space-y-1.5 border-t pt-4">
              {proPlan.features.map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="h-3 w-3 shrink-0 text-green-500" />
                  {f}
                </div>
              ))}
            </div>
            <Button
              className="mt-4 w-full bg-blue-500 hover:bg-blue-600"
              onClick={handleUpgrade}
              disabled={loading || tier !== "FREE"}
            >
              {loading
                ? "Redirecting..."
                : tier === "FREE"
                ? "Upgrade to PRO"
                : "Current plan"}
            </Button>
          </div>

          {/* ENTERPRISE */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Enterprise
            </p>
            <p className="mt-1 text-2xl font-bold">{enterprisePlan.price}</p>
            <p className="text-xs text-muted-foreground">&nbsp;</p>
            <div className="mt-4 space-y-1.5 border-t pt-4">
              {enterprisePlan.features.map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="h-3 w-3 shrink-0 text-green-500" />
                  {f}
                </div>
              ))}
            </div>
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => {
                window.location.href = "mailto:hello@s3dock.app";
              }}
            >
              Contact us
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
