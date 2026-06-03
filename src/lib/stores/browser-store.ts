import { create } from "zustand";
import type { S3Object } from "@/types";

interface PaneBrowserState {
  selectedItems: Set<string>;
  selectionAnchor: string | null;
  viewMode: "list" | "grid";
  sortBy: "name" | "size" | "date";
  sortOrder: "asc" | "desc";
}

export interface DragState {
  isDragging: boolean;
  sourcePaneId: string | null;
  sourceConnectionId: string | null;
  sourceBucket: string | null;
  sourcePath: string;
  draggedItems: S3Object[];
}

function createDefaultPaneState(): PaneBrowserState {
  return {
    selectedItems: new Set(),
    selectionAnchor: null,
    viewMode: "list",
    sortBy: "name",
    sortOrder: "asc",
  };
}

interface BrowserState {
  paneStates: Record<string, PaneBrowserState>;
  dragState: DragState;

  // Pane state management
  initPaneState: (paneId: string) => void;
  removePaneState: (paneId: string) => void;
  getPaneState: (paneId: string) => PaneBrowserState;

  // Selection actions (scoped to pane)
  toggleSelection: (paneId: string, key: string) => void;
  setSelectionRange: (paneId: string, keys: string[], anchor: string | null) => void;
  selectAll: (paneId: string, keys: string[]) => void;
  clearSelection: (paneId: string) => void;

  // View preferences (scoped to pane)
  setViewMode: (paneId: string, mode: "list" | "grid") => void;
  setSortBy: (paneId: string, sortBy: "name" | "size" | "date") => void;
  setSortOrder: (paneId: string, order: "asc" | "desc") => void;

  // Drag actions
  startDrag: (
    paneId: string,
    connectionId: string,
    bucket: string,
    path: string,
    items: S3Object[]
  ) => void;
  endDrag: () => void;
}

const initialDragState: DragState = {
  isDragging: false,
  sourcePaneId: null,
  sourceConnectionId: null,
  sourceBucket: null,
  sourcePath: "",
  draggedItems: [],
};

export const useBrowserStore = create<BrowserState>((set, get) => ({
  paneStates: {},
  dragState: initialDragState,

  initPaneState: (paneId) => {
    set((state) => {
      if (state.paneStates[paneId]) return state;
      return {
        paneStates: {
          ...state.paneStates,
          [paneId]: createDefaultPaneState(),
        },
      };
    });
  },

  removePaneState: (paneId) => {
    set((state) => {
      const { [paneId]: removed, ...remaining } = state.paneStates;
      return { paneStates: remaining };
    });
  },

  getPaneState: (paneId) => {
    const state = get().paneStates[paneId];
    // Return existing state or default (don't initialize during render)
    return state || createDefaultPaneState();
  },

  toggleSelection: (paneId, key) => {
    set((state) => {
      const paneState = state.paneStates[paneId] || createDefaultPaneState();
      const newSelection = new Set(paneState.selectedItems);
      if (newSelection.has(key)) {
        newSelection.delete(key);
      } else {
        newSelection.add(key);
      }
      return {
        paneStates: {
          ...state.paneStates,
          [paneId]: {
            ...paneState,
            selectedItems: newSelection,
            selectionAnchor: key,
          },
        },
      };
    });
  },

  setSelectionRange: (paneId, keys, anchor) => {
    set((state) => {
      const paneState = state.paneStates[paneId] || createDefaultPaneState();
      return {
        paneStates: {
          ...state.paneStates,
          [paneId]: {
            ...paneState,
            selectedItems: new Set(keys),
            selectionAnchor: anchor,
          },
        },
      };
    });
  },

  selectAll: (paneId, keys) => {
    set((state) => {
      const paneState = state.paneStates[paneId] || createDefaultPaneState();
      return {
        paneStates: {
          ...state.paneStates,
          [paneId]: {
            ...paneState,
            selectedItems: new Set(keys),
            selectionAnchor: keys[0] ?? null,
          },
        },
      };
    });
  },

  clearSelection: (paneId) => {
    set((state) => {
      const paneState = state.paneStates[paneId] || createDefaultPaneState();
      return {
        paneStates: {
          ...state.paneStates,
          [paneId]: {
            ...paneState,
            selectedItems: new Set(),
            selectionAnchor: null,
          },
        },
      };
    });
  },

  setViewMode: (paneId, viewMode) => {
    set((state) => {
      const paneState = state.paneStates[paneId] || createDefaultPaneState();
      return {
        paneStates: {
          ...state.paneStates,
          [paneId]: { ...paneState, viewMode },
        },
      };
    });
  },

  setSortBy: (paneId, sortBy) => {
    set((state) => {
      const paneState = state.paneStates[paneId] || createDefaultPaneState();
      return {
        paneStates: {
          ...state.paneStates,
          [paneId]: { ...paneState, sortBy },
        },
      };
    });
  },

  setSortOrder: (paneId, sortOrder) => {
    set((state) => {
      const paneState = state.paneStates[paneId] || createDefaultPaneState();
      return {
        paneStates: {
          ...state.paneStates,
          [paneId]: { ...paneState, sortOrder },
        },
      };
    });
  },

  startDrag: (paneId, connectionId, bucket, path, items) => {
    set({
      dragState: {
        isDragging: true,
        sourcePaneId: paneId,
        sourceConnectionId: connectionId,
        sourceBucket: bucket,
        sourcePath: path,
        draggedItems: items,
      },
    });
  },

  endDrag: () => {
    set({ dragState: initialDragState });
  },
}));
