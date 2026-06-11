import { create } from "zustand";

export type UploadStatus =
  | "queued"
  | "uploading"
  | "paused"
  | "completed"
  | "error"
  | "canceled";

export const FINISHED_STATUSES: readonly UploadStatus[] = [
  "completed",
  "error",
  "canceled",
];

export interface UploadItem {
  id: string;
  fileName: string;
  size: number;
  connectionId: string;
  bucket: string;
  key: string;
  status: UploadStatus;
  loaded: number;
  error?: string;
}

interface UploadState {
  items: UploadItem[];
  addItem: (item: UploadItem) => void;
  updateItem: (id: string, updates: Partial<Omit<UploadItem, "id">>) => void;
  removeItem: (id: string) => void;
  clearFinished: () => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  updateItem: (id, updates) =>
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    })),
  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
  clearFinished: () =>
    set((state) => ({
      items: state.items.filter((i) => !FINISHED_STATUSES.includes(i.status)),
    })),
}));
