import { create } from "zustand";
import type { ActivityAction } from "@/generated/prisma/client";

export type ActivityScope = {
  connectionId: string;
  bucket: string;
  prefix?: string;
  objectKey?: string;
};

interface ActivityDrawerState {
  isOpen: boolean;
  scope: ActivityScope | null;
  userFilter: string | null;
  actionFilter: ActivityAction[];

  toggle: () => void;
  open: (scope?: ActivityScope) => void;
  close: () => void;
  setScope: (scope: ActivityScope | null) => void;
  setUserFilter: (userId: string | null) => void;
  setActionFilter: (actions: ActivityAction[]) => void;
}

export const useActivityDrawerStore = create<ActivityDrawerState>((set) => ({
  isOpen: false,
  scope: null,
  userFilter: null,
  actionFilter: [],

  toggle: () =>
    set((state) => ({
      isOpen: !state.isOpen,
      ...(state.isOpen ? { userFilter: null, actionFilter: [] } : {}),
    })),

  open: (scope) =>
    set({ isOpen: true, ...(scope ? { scope } : {}) }),

  close: () => set({ isOpen: false, userFilter: null, actionFilter: [] }),

  setScope: (scope) => set({ scope }),

  setUserFilter: (userId) => set({ userFilter: userId }),

  setActionFilter: (actions) => set({ actionFilter: actions }),
}));
