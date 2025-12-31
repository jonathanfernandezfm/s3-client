import { create } from "zustand";
import type { S3Connection, ConnectionStatus } from "@/types";

interface ConnectionState {
  connection: S3Connection | null;
  status: ConnectionStatus;
  setConnection: (connection: S3Connection | null) => void;
  setStatus: (status: ConnectionStatus) => void;
  clearConnection: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connection: null,
  status: { connected: false },
  setConnection: (connection) => set({ connection }),
  setStatus: (status) => set({ status }),
  clearConnection: () =>
    set({
      connection: null,
      status: { connected: false },
    }),
}));
