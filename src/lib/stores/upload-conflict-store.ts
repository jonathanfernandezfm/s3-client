import { create } from "zustand";

export type ConflictChoice = "replace" | "skip" | "keep-both" | "cancel";

interface PendingConflict {
  total: number;
  conflictCount: number;
  conflictNames: string[]; // display names, for the dialog body (cap to ~10)
}

interface UploadConflictState {
  pending: PendingConflict | null;
  _resolve: ((choice: ConflictChoice) => void) | null;
  ask: (c: PendingConflict) => Promise<ConflictChoice>;
  resolve: (choice: ConflictChoice) => void;
}

export const useUploadConflictStore = create<UploadConflictState>((set, get) => ({
  pending: null,
  _resolve: null,
  ask: (c) =>
    new Promise<ConflictChoice>((resolve) => set({ pending: c, _resolve: resolve })),
  resolve: (choice) => {
    get()._resolve?.(choice);
    set({ pending: null, _resolve: null });
  },
}));
