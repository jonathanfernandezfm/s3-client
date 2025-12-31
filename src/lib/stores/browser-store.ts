import { create } from "zustand";

interface BrowserState {
  currentBucket: string | null;
  currentPath: string;
  selectedItems: Set<string>;
  viewMode: "list" | "grid";
  sortBy: "name" | "size" | "date";
  sortOrder: "asc" | "desc";
  setCurrentBucket: (bucket: string | null) => void;
  setCurrentPath: (path: string) => void;
  toggleSelection: (key: string) => void;
  selectAll: (keys: string[]) => void;
  clearSelection: () => void;
  setViewMode: (mode: "list" | "grid") => void;
  setSortBy: (sortBy: "name" | "size" | "date") => void;
  setSortOrder: (order: "asc" | "desc") => void;
}

export const useBrowserStore = create<BrowserState>((set) => ({
  currentBucket: null,
  currentPath: "",
  selectedItems: new Set(),
  viewMode: "list",
  sortBy: "name",
  sortOrder: "asc",
  setCurrentBucket: (currentBucket) =>
    set({ currentBucket, currentPath: "", selectedItems: new Set() }),
  setCurrentPath: (currentPath) =>
    set({ currentPath, selectedItems: new Set() }),
  toggleSelection: (key) =>
    set((state) => {
      const newSelection = new Set(state.selectedItems);
      if (newSelection.has(key)) {
        newSelection.delete(key);
      } else {
        newSelection.add(key);
      }
      return { selectedItems: newSelection };
    }),
  selectAll: (keys) => set({ selectedItems: new Set(keys) }),
  clearSelection: () => set({ selectedItems: new Set() }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
}));
