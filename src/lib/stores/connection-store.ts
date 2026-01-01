import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { S3Connection, ConnectionStatus } from "@/types";

interface ConnectionState {
  connections: S3Connection[];
  statuses: Record<string, ConnectionStatus>;
  addConnection: (connection: S3Connection) => void;
  updateConnection: (id: string, connection: Partial<S3Connection>) => void;
  removeConnection: (id: string) => void;
  setStatus: (id: string, status: ConnectionStatus) => void;
  getConnection: (id: string) => S3Connection | undefined;
  getConnectedConnections: () => S3Connection[];
  clearAll: () => void;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      connections: [],
      statuses: {},

      addConnection: (connection) =>
        set((state) => ({
          connections: [...state.connections, connection],
          statuses: {
            ...state.statuses,
            [connection.id]: { connected: false },
          },
        })),

      updateConnection: (id, updates) =>
        set((state) => ({
          connections: state.connections.map((conn) =>
            conn.id === id ? { ...conn, ...updates } : conn
          ),
        })),

      removeConnection: (id) =>
        set((state) => {
          const { [id]: _, ...remainingStatuses } = state.statuses;
          return {
            connections: state.connections.filter((conn) => conn.id !== id),
            statuses: remainingStatuses,
          };
        }),

      setStatus: (id, status) =>
        set((state) => ({
          statuses: {
            ...state.statuses,
            [id]: status,
          },
        })),

      getConnection: (id) => get().connections.find((conn) => conn.id === id),

      getConnectedConnections: () => {
        const state = get();
        return state.connections.filter(
          (conn) => state.statuses[conn.id]?.connected
        );
      },

      clearAll: () =>
        set({
          connections: [],
          statuses: {},
        }),
    }),
    {
      name: "s3-connections",
      partialize: (state) => ({
        connections: state.connections,
      }),
    }
  )
);
