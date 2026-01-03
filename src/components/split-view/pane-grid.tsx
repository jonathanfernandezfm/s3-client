"use client";

import { useLayoutStore } from "@/lib/stores/layout-store";
import { Pane } from "./pane";

export function PaneGrid() {
  const { grid } = useLayoutStore();

  // Sort panes by column for proper grid placement
  const sortedPanes = [...grid.panes].sort((a, b) => a.column - b.column);

  return (
    <div
      className="grid h-full"
      style={{
        gridTemplateColumns: `repeat(${grid.columns}, 1fr)`,
      }}
    >
      {sortedPanes.map((pos, index) => (
        <div
          key={pos.paneId}
          style={{
            gridColumn: pos.column + 1,
          }}
          className="min-h-0 min-w-0"
        >
          <Pane
            paneId={pos.paneId}
            isLastColumn={index === sortedPanes.length - 1}
          />
        </div>
      ))}
    </div>
  );
}
