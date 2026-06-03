"use client";

import { useCallback } from "react";
import { useBrowserStore } from "@/lib/stores/browser-store";
import { computeRangeKeys } from "@/lib/selection/range";

export interface ModifierKeys {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export function usePaneSelection(paneId: string, orderedKeys: string[]) {
  const toggleSelection = useBrowserStore((s) => s.toggleSelection);
  const setSelectionRange = useBrowserStore((s) => s.setSelectionRange);
  const selectAll = useBrowserStore((s) => s.selectAll);
  const clearSelection = useBrowserStore((s) => s.clearSelection);

  const handleSelect = useCallback(
    (key: string, mods: ModifierKeys) => {
      if (mods.shiftKey) {
        const anchor =
          useBrowserStore.getState().paneStates[paneId]?.selectionAnchor ?? null;
        const range = computeRangeKeys(orderedKeys, anchor, key);
        setSelectionRange(paneId, range, anchor ?? key);
        return;
      }
      // Ctrl/Cmd+Click and plain checkbox click both toggle and re-anchor.
      toggleSelection(paneId, key);
    },
    [paneId, orderedKeys, toggleSelection, setSelectionRange]
  );

  const selectAllInPane = useCallback(() => {
    selectAll(paneId, orderedKeys);
  }, [paneId, orderedKeys, selectAll]);

  const clearSelectionInPane = useCallback(() => {
    clearSelection(paneId);
  }, [paneId, clearSelection]);

  return { handleSelect, selectAllInPane, clearSelectionInPane };
}
