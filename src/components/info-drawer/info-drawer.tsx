"use client";

import { useEffect } from "react";
import { X, Activity, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInfoDrawerStore } from "@/lib/stores/info-drawer-store";
import { ActivityTab } from "./activity-tab";
import { NotesTab } from "./notes-tab";

export function InfoDrawer() {
  const { isOpen, scope, activeTab, setActiveTab, close } = useInfoDrawerStore();

  const hasScope = !!scope?.connectionId && !!scope?.bucket;
  const scopeLabel = scope?.bucket
    ? scope.objectKey
      ? `${scope.bucket} / ${scope.objectKey}`
      : scope.prefix
      ? `${scope.bucket} / ${scope.prefix}`
      : scope.bucket
    : undefined;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, close]);

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
        aria-label="Info drawer"
        aria-hidden={!isOpen}
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
              {activeTab === "activity" ? (
                <Activity className="h-4 w-4 text-muted-foreground" />
              ) : (
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              )}
              <h2 className="text-sm font-semibold">
                {activeTab === "activity" ? "Activity" : "Notes"}
              </h2>
            </div>
            {scopeLabel && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[260px]">
                {scopeLabel}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={close}
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Tab strip */}
        <div className="flex border-b border-border shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("activity")}
            className={`flex-1 text-xs font-medium py-2 border-b-2 transition-colors ${
              activeTab === "activity"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Activity
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("notes")}
            className={`flex-1 text-xs font-medium py-2 border-b-2 transition-colors ${
              activeTab === "notes"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Notes
          </button>
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
        ) : (
          <NotesTab />
        )}
      </div>
    </>
  );
}
