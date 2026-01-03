"use client";

import { PaneGrid } from "./pane-grid";

export function SplitViewContainer() {
  return (
    <div className="flex flex-col h-full">
      <PaneGrid />
    </div>
  );
}
