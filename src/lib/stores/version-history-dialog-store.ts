import { create } from "zustand";

export type VersionHistoryTarget = {
  connectionId: string;
  bucket: string;
  key: string;
};

interface VersionHistoryDialogState {
  isOpen: boolean;
  target: VersionHistoryTarget | null;
  selectedVersionId: string | null;
  diffSelection: string[];
  open: (target: VersionHistoryTarget, opts?: { preselectVersionId?: string }) => void;
  close: () => void;
  selectVersion: (versionId: string | null) => void;
  toggleDiffSelection: (versionId: string) => void;
  clearDiffSelection: () => void;
}

export const useVersionHistoryDialogStore = create<VersionHistoryDialogState>((set, get) => ({
  isOpen: false,
  target: null,
  selectedVersionId: null,
  diffSelection: [],

  open: (target, opts) =>
    set({
      isOpen: true,
      target,
      selectedVersionId: opts?.preselectVersionId ?? null,
      diffSelection: [],
    }),

  close: () =>
    set({
      isOpen: false,
      target: null,
      selectedVersionId: null,
      diffSelection: [],
    }),

  selectVersion: (versionId) => set({ selectedVersionId: versionId }),

  toggleDiffSelection: (versionId) => {
    const current = get().diffSelection;
    if (current.includes(versionId)) {
      set({ diffSelection: current.filter((id) => id !== versionId) });
    } else if (current.length < 2) {
      set({ diffSelection: [...current, versionId] });
    } else {
      set({ diffSelection: [current[1], versionId] });
    }
  },

  clearDiffSelection: () => set({ diffSelection: [] }),
}));
