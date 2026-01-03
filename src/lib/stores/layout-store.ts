import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Tab {
  id: string;
  type: "buckets" | "browser";
  connectionId?: string;
  connectionName?: string;
  bucket?: string;
  path: string;
}

export interface Pane {
  id: string;
  tabs: Tab[];
  activeTabId: string | null;
}

export interface PanePosition {
  paneId: string;
  column: number;
  row: number;
}

export interface LayoutGrid {
  columns: number;
  rows: number;
  panes: PanePosition[];
}

interface LayoutState {
  grid: LayoutGrid;
  panes: Record<string, Pane>;
  focusedPaneId: string | null;

  // Pane actions
  addPane: (position: "right" | "below") => string | null;
  removePane: (paneId: string) => void;
  setFocusedPane: (paneId: string) => void;

  // Tab actions (scoped to pane)
  addTab: (paneId: string, tab: Omit<Tab, "id">) => string;
  removeTab: (paneId: string, tabId: string) => void;
  setActiveTab: (paneId: string, tabId: string) => void;
  moveTab: (fromPaneId: string, tabId: string, toPaneId: string) => void;

  // Tab update actions
  updateTabPath: (paneId: string, tabId: string, path: string) => void;
  updateTabBucket: (
    paneId: string,
    tabId: string,
    connectionId: string,
    connectionName: string,
    bucket: string
  ) => void;
  resetTabToBuckets: (paneId: string, tabId: string) => void;

  // Utility
  findTabPane: (tabId: string) => string | null;
  getActiveTab: (paneId: string) => Tab | null;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function createDefaultPane(): Pane {
  const defaultTabId = "default";
  return {
    id: "pane-default",
    tabs: [{ id: defaultTabId, type: "buckets", path: "" }],
    activeTabId: defaultTabId,
  };
}

function createDefaultLayout(): { grid: LayoutGrid; panes: Record<string, Pane>; focusedPaneId: string } {
  const defaultPane = createDefaultPane();
  return {
    grid: {
      columns: 1,
      rows: 1,
      panes: [{ paneId: defaultPane.id, column: 0, row: 0 }],
    },
    panes: { [defaultPane.id]: defaultPane },
    focusedPaneId: defaultPane.id,
  };
}

// Migration from old tab store format
function migrateFromTabStore(): { grid: LayoutGrid; panes: Record<string, Pane>; focusedPaneId: string } | null {
  if (typeof window === "undefined") return null;

  try {
    const oldData = localStorage.getItem("s3-tabs");
    if (!oldData) return null;

    const parsed = JSON.parse(oldData);
    if (!parsed.state?.tabs || !Array.isArray(parsed.state.tabs)) return null;

    const { tabs, activeTabId } = parsed.state;

    const defaultPaneId = "pane-default";
    return {
      grid: {
        columns: 1,
        rows: 1,
        panes: [{ paneId: defaultPaneId, column: 0, row: 0 }],
      },
      panes: {
        [defaultPaneId]: {
          id: defaultPaneId,
          tabs: tabs,
          activeTabId: activeTabId || tabs[0]?.id || null,
        },
      },
      focusedPaneId: defaultPaneId,
    };
  } catch {
    return null;
  }
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      ...createDefaultLayout(),

      addPane: (position) => {
        const { grid, panes, focusedPaneId } = get();

        // Check limits: max 3 columns, max 2 rows
        if (position === "right" && grid.columns >= 3) return null;
        if (position === "below" && grid.rows >= 2) return null;

        const newPaneId = `pane-${generateId()}`;
        const newTabId = generateId();
        const newPane: Pane = {
          id: newPaneId,
          tabs: [{ id: newTabId, type: "buckets", path: "" }],
          activeTabId: newTabId,
        };

        // Find current focused pane position
        const focusedPosition = grid.panes.find((p) => p.paneId === focusedPaneId);

        if (position === "right") {
          // Add a new column
          const newColumn = (focusedPosition?.column ?? 0) + 1;

          // Shift existing panes in columns >= newColumn
          const updatedPanes = grid.panes.map((p) => ({
            ...p,
            column: p.column >= newColumn ? p.column + 1 : p.column,
          }));

          // Add new pane at the new column, same row as focused
          const newPosition: PanePosition = {
            paneId: newPaneId,
            column: newColumn,
            row: focusedPosition?.row ?? 0,
          };

          set({
            grid: {
              columns: grid.columns + 1,
              rows: grid.rows,
              panes: [...updatedPanes, newPosition],
            },
            panes: { ...panes, [newPaneId]: newPane },
            focusedPaneId: newPaneId,
          });
        } else {
          // Add a new row
          const newRow = (focusedPosition?.row ?? 0) + 1;

          // Shift existing panes in rows >= newRow
          const updatedPanes = grid.panes.map((p) => ({
            ...p,
            row: p.row >= newRow ? p.row + 1 : p.row,
          }));

          // Add new pane at the new row, same column as focused
          const newPosition: PanePosition = {
            paneId: newPaneId,
            column: focusedPosition?.column ?? 0,
            row: newRow,
          };

          set({
            grid: {
              columns: grid.columns,
              rows: grid.rows + 1,
              panes: [...updatedPanes, newPosition],
            },
            panes: { ...panes, [newPaneId]: newPane },
            focusedPaneId: newPaneId,
          });
        }

        return newPaneId;
      },

      removePane: (paneId) => {
        const { grid, panes, focusedPaneId } = get();

        // Don't remove the last pane
        if (Object.keys(panes).length <= 1) return;

        const removedPosition = grid.panes.find((p) => p.paneId === paneId);
        if (!removedPosition) return;

        // Remove pane from positions
        const remainingPositions = grid.panes.filter((p) => p.paneId !== paneId);

        // Check if we can reduce columns or rows
        const columnsUsed = new Set(remainingPositions.map((p) => p.column));
        const rowsUsed = new Set(remainingPositions.map((p) => p.row));

        // Normalize columns (shift down if there are gaps)
        const sortedColumns = Array.from(columnsUsed).sort((a, b) => a - b);
        const columnMap = new Map(sortedColumns.map((col, idx) => [col, idx]));

        // Normalize rows
        const sortedRows = Array.from(rowsUsed).sort((a, b) => a - b);
        const rowMap = new Map(sortedRows.map((row, idx) => [row, idx]));

        const normalizedPositions = remainingPositions.map((p) => ({
          ...p,
          column: columnMap.get(p.column) ?? p.column,
          row: rowMap.get(p.row) ?? p.row,
        }));

        // Remove pane from panes record
        const { [paneId]: removed, ...remainingPanes } = panes;

        // Update focused pane if needed
        let newFocusedPaneId = focusedPaneId;
        if (focusedPaneId === paneId) {
          // Focus adjacent pane
          const paneIds = Object.keys(remainingPanes);
          newFocusedPaneId = paneIds[0] || null;
        }

        set({
          grid: {
            columns: sortedColumns.length,
            rows: sortedRows.length,
            panes: normalizedPositions,
          },
          panes: remainingPanes,
          focusedPaneId: newFocusedPaneId,
        });
      },

      setFocusedPane: (paneId) => {
        set({ focusedPaneId: paneId });
      },

      addTab: (paneId, tab) => {
        const id = generateId();
        const newTab: Tab = { ...tab, id };

        set((state) => {
          const pane = state.panes[paneId];
          if (!pane) return state;

          return {
            panes: {
              ...state.panes,
              [paneId]: {
                ...pane,
                tabs: [...pane.tabs, newTab],
                activeTabId: id,
              },
            },
          };
        });

        return id;
      },

      removeTab: (paneId, tabId) => {
        const { panes, grid } = get();
        const pane = panes[paneId];
        if (!pane) return;

        // If this is the last tab in the pane
        if (pane.tabs.length <= 1) {
          // If there are other panes, remove this pane entirely
          if (Object.keys(panes).length > 1) {
            get().removePane(paneId);
            return;
          }
          // Otherwise, keep the pane with a default buckets tab
          const newTabId = generateId();
          set({
            panes: {
              ...panes,
              [paneId]: {
                ...pane,
                tabs: [{ id: newTabId, type: "buckets", path: "" }],
                activeTabId: newTabId,
              },
            },
          });
          return;
        }

        const tabIndex = pane.tabs.findIndex((t) => t.id === tabId);
        const newTabs = pane.tabs.filter((t) => t.id !== tabId);

        let newActiveId = pane.activeTabId;
        if (pane.activeTabId === tabId) {
          const newIndex = Math.min(tabIndex, newTabs.length - 1);
          newActiveId = newTabs[newIndex]?.id || null;
        }

        set({
          panes: {
            ...panes,
            [paneId]: {
              ...pane,
              tabs: newTabs,
              activeTabId: newActiveId,
            },
          },
        });
      },

      setActiveTab: (paneId, tabId) => {
        set((state) => {
          const pane = state.panes[paneId];
          if (!pane) return state;

          return {
            panes: {
              ...state.panes,
              [paneId]: {
                ...pane,
                activeTabId: tabId,
              },
            },
          };
        });
      },

      moveTab: (fromPaneId, tabId, toPaneId) => {
        const { panes } = get();
        const fromPane = panes[fromPaneId];
        const toPane = panes[toPaneId];

        if (!fromPane || !toPane) return;

        const tab = fromPane.tabs.find((t) => t.id === tabId);
        if (!tab) return;

        // Remove from source pane
        get().removeTab(fromPaneId, tabId);

        // Add to target pane
        set((state) => {
          const targetPane = state.panes[toPaneId];
          if (!targetPane) return state;

          return {
            panes: {
              ...state.panes,
              [toPaneId]: {
                ...targetPane,
                tabs: [...targetPane.tabs, tab],
                activeTabId: tab.id,
              },
            },
            focusedPaneId: toPaneId,
          };
        });
      },

      updateTabPath: (paneId, tabId, path) => {
        set((state) => {
          const pane = state.panes[paneId];
          if (!pane) return state;

          return {
            panes: {
              ...state.panes,
              [paneId]: {
                ...pane,
                tabs: pane.tabs.map((t) =>
                  t.id === tabId ? { ...t, path } : t
                ),
              },
            },
          };
        });
      },

      updateTabBucket: (paneId, tabId, connectionId, connectionName, bucket) => {
        set((state) => {
          const pane = state.panes[paneId];
          if (!pane) return state;

          return {
            panes: {
              ...state.panes,
              [paneId]: {
                ...pane,
                tabs: pane.tabs.map((t) =>
                  t.id === tabId
                    ? { ...t, type: "browser", connectionId, connectionName, bucket, path: "" }
                    : t
                ),
              },
            },
          };
        });
      },

      resetTabToBuckets: (paneId, tabId) => {
        set((state) => {
          const pane = state.panes[paneId];
          if (!pane) return state;

          return {
            panes: {
              ...state.panes,
              [paneId]: {
                ...pane,
                tabs: pane.tabs.map((t) =>
                  t.id === tabId
                    ? { id: t.id, type: "buckets", path: "" }
                    : t
                ),
              },
            },
          };
        });
      },

      findTabPane: (tabId) => {
        const { panes } = get();
        for (const [paneId, pane] of Object.entries(panes)) {
          if (pane.tabs.some((t) => t.id === tabId)) {
            return paneId;
          }
        }
        return null;
      },

      getActiveTab: (paneId) => {
        const pane = get().panes[paneId];
        if (!pane || !pane.activeTabId) return null;
        return pane.tabs.find((t) => t.id === pane.activeTabId) || null;
      },
    }),
    {
      name: "s3-layout",
      onRehydrateStorage: () => (state) => {
        // Try migration from old tab store if no layout exists
        if (typeof window !== "undefined") {
          const hasLayout = localStorage.getItem("s3-layout");
          if (!hasLayout) {
            const migrated = migrateFromTabStore();
            if (migrated && state) {
              state.grid = migrated.grid;
              state.panes = migrated.panes;
              state.focusedPaneId = migrated.focusedPaneId;
            }
          }
        }
      },
    }
  )
);
