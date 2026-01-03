import { create } from "zustand";

interface PaneBrowserState {
  selectedItems: Set<string>;
  viewMode: "list" | "grid";
  sortBy: "name" | "size" | "date";
  sortOrder: "asc" | "desc";
}

function createDefaultPaneState(): PaneBrowserState {
  return {
    selectedItems: new Set(),
    viewMode: "list",
    sortBy: "name",
    sortOrder: "asc",
  };
}

interface BrowserState {
  paneStates: Record<string, PaneBrowserState>;

  // Pane state management
  initPaneState: (paneId: string) => void;
  removePaneState: (paneId: string) => void;
  getPaneState: (paneId: string) => PaneBrowserState;

  // Selection actions (scoped to pane)
  toggleSelection: (paneId: string, key: string) => void;
  selectAll: (paneId: string, keys: string[]) => void;
  clearSelection: (paneId: string) => void;

  // View preferences (scoped to pane)
  setViewMode: (paneId: string, mode: "list" | "grid") => void;
  setSortBy: (paneId: string, sortBy: "name" | "size" | "date") => void;
  setSortOrder: (paneId: string, order: "asc" | "desc") => void;
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
  paneStates: {},

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
    if (!state) {
      // Initialize if not exists
      get().initPaneState(paneId);
      return get().paneStates[paneId] || createDefaultPaneState();
    }
    return state;
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
          [paneId]: { ...paneState, selectedItems: newSelection },
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
          [paneId]: { ...paneState, selectedItems: new Set(keys) },
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
          [paneId]: { ...paneState, selectedItems: new Set() },
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
}));
