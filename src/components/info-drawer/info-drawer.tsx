"use client";

import { useEffect, useRef } from "react";
import {
  X,
  Activity,
  MessageSquare,
  History,
  File,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useInfoDrawerStore,
  type InfoDrawerTab,
} from "@/lib/stores/info-drawer-store";
import { ActivityTab } from "./activity-tab";
import { NotesTab } from "./notes-tab";
import { VersionsTab } from "./versions-tab";

const TAB_META: Record<InfoDrawerTab, { label: string; icon: LucideIcon }> = {
  activity: { label: "Activity", icon: Activity },
  notes: { label: "Notes", icon: MessageSquare },
  versions: { label: "Versions", icon: History },
};

const TAB_ORDER: InfoDrawerTab[] = ["activity", "notes", "versions"];

export function InfoDrawer() {
  const { isOpen, scope, activeTab, setActiveTab, setScope, close } = useInfoDrawerStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const hasScope = !!scope?.connectionId && !!scope?.bucket;
  const scopeLabel = scope?.bucket
    ? scope.objectKey
      ? `${scope.bucket} / ${scope.objectKey}`
      : scope.prefix
      ? `${scope.bucket} / ${scope.prefix}`
      : scope.bucket
    : undefined;
  const fileSubject = scope?.objectKey
    ? scope.objectKey.split("/").filter(Boolean).pop() ?? scope.objectKey
    : null;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen) {
      // remember where focus was so we can restore it on close
      lastFocusedRef.current = document.activeElement as HTMLElement | null;
      // move focus into the drawer
      panelRef.current?.focus({ preventScroll: true });
    } else {
      // restore focus to the trigger when closing
      lastFocusedRef.current?.focus?.({ preventScroll: true });
      lastFocusedRef.current = null;
    }
  }, [isOpen]);

  const ActiveIcon = TAB_META[activeTab].icon;

  return (
    <>
      {isOpen && (
        <div
          aria-hidden
          style={{ position: "fixed", inset: 0, zIndex: 39 }}
          onClick={close}
        />
      )}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-drawer-title"
        aria-hidden={!isOpen}
        tabIndex={-1}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: 380,
          zIndex: 40,
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
          pointerEvents: isOpen ? "auto" : "none",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        className="bg-background border-l border-border shadow-xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <ActiveIcon className="h-4 w-4 text-muted-foreground" />
              <h2 id="info-drawer-title" className="text-sm font-semibold">{TAB_META[activeTab].label}</h2>
            </div>
            {scopeLabel && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-65">
                {scopeLabel}
              </p>
            )}
            {fileSubject && (
              <button
                type="button"
                onClick={() =>
                  scope && setScope({ ...scope, objectKey: undefined })
                }
                className="mt-1 inline-flex items-center gap-1 max-w-[260px] rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
                title="Show folder activity instead"
              >
                <File className="h-3 w-3 shrink-0" />
                <span className="truncate">{fileSubject}</span>
                <X className="h-3 w-3 shrink-0" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={close}
              title="Close"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Tab strip */}
        <div className="flex border-b border-border shrink-0">
          {TAB_ORDER.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 text-xs font-medium py-2 border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_META[tab].label}
            </button>
          ))}
        </div>

        {/* Body */}
        {!hasScope ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              Open a bucket to see {activeTab}
            </p>
          </div>
        ) : activeTab === "activity" ? (
          <ActivityTab />
        ) : activeTab === "notes" ? (
          <NotesTab />
        ) : (
          <VersionsTab />
        )}
      </div>
    </>
  );
}
