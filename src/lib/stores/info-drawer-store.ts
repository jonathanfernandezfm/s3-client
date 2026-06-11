import { create } from "zustand";
import type { ActivityAction } from "@/generated/prisma/client";

export type InfoDrawerTab = "activity" | "notes" | "versions" | "properties";

export type InfoDrawerScope = {
  connectionId: string;
  bucket: string;
  prefix?: string;
  objectKey?: string;
};

interface InfoDrawerState {
  isOpen: boolean;
  activeTab: InfoDrawerTab;
  scope: InfoDrawerScope | null;

  userFilter: string | null;
  actionFilter: ActivityAction[] | null;

  open: (tab?: InfoDrawerTab) => void;
  close: () => void;
  toggle: (tab?: InfoDrawerTab) => void;
  setActiveTab: (tab: InfoDrawerTab) => void;
  setScope: (scope: InfoDrawerScope | null) => void;
  setUserFilter: (userId: string | null) => void;
  setActionFilter: (actions: ActivityAction[] | null) => void;
}

export const useInfoDrawerStore = create<InfoDrawerState>((set, get) => ({
  isOpen: false,
  activeTab: "activity",
  scope: null,
  userFilter: null,
  actionFilter: null,

  open: (tab) =>
    set((state) => ({
      isOpen: true,
      activeTab: tab ?? state.activeTab,
    })),

  close: () =>
    set({ isOpen: false, userFilter: null, actionFilter: null }),

  toggle: (tab) => {
    const state = get();
    if (state.isOpen) {
      if (tab && state.activeTab !== tab) {
        set({ activeTab: tab });
      } else {
        set({ isOpen: false, userFilter: null, actionFilter: null });
      }
    } else {
      set({ isOpen: true, activeTab: tab ?? state.activeTab });
    }
  },

  setActiveTab: (activeTab) => set({ activeTab }),
  setScope: (scope) => set({ scope }),
  setUserFilter: (userId) => set({ userFilter: userId }),
  setActionFilter: (actions) => set({ actionFilter: actions }),
}));
