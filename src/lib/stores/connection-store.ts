import { create } from "zustand";
import type { ConnectionStatus } from "@/types";

interface ConnectionState {
  statuses: Record<string, ConnectionStatus>;
  setStatus: (id: string, status: ConnectionStatus) => void;
  removeStatus: (id: string) => void;
  clearStatuses: () => void;
}

export const useConnectionStore = create<ConnectionState>()((set) => ({
  statuses: {},

  setStatus: (id, status) =>
    set((state) => ({
      statuses: {
        ...state.statuses,
        [id]: status,
      },
    })),

  removeStatus: (id) =>
    set((state) => {
      const { [id]: _, ...remainingStatuses } = state.statuses;
      return { statuses: remainingStatuses };
    }),

  clearStatuses: () => set({ statuses: {} }),
}));
