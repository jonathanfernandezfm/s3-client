import { create } from "zustand";
import { useInfoDrawerStore } from "./info-drawer-store";

export type PropertiesDrawerScope = {
  connectionId: string;
  bucket: string;
  objectKey: string;
};

interface PropertiesDrawerState {
  isOpen: boolean;
  scope: PropertiesDrawerScope | null;
  open: (scope: PropertiesDrawerScope) => void;
  close: () => void;
}

export const usePropertiesDrawerStore = create<PropertiesDrawerState>((set) => ({
  isOpen: false,
  scope: null,

  open: (scope) => {
    useInfoDrawerStore.getState().close();
    set({ isOpen: true, scope });
  },

  close: () => set({ isOpen: false }),
}));
