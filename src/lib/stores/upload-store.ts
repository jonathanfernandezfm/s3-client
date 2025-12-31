import { create } from "zustand";

export interface UploadItem {
  id: string;
  file: File;
  bucket: string;
  key: string;
  progress: number;
  status: "pending" | "uploading" | "completed" | "error";
  error?: string;
}

interface UploadState {
  uploads: UploadItem[];
  addUpload: (upload: Omit<UploadItem, "progress" | "status">) => void;
  updateUpload: (id: string, updates: Partial<UploadItem>) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  uploads: [],
  addUpload: (upload) =>
    set((state) => ({
      uploads: [
        ...state.uploads,
        { ...upload, progress: 0, status: "pending" },
      ],
    })),
  updateUpload: (id, updates) =>
    set((state) => ({
      uploads: state.uploads.map((u) =>
        u.id === id ? { ...u, ...updates } : u
      ),
    })),
  removeUpload: (id) =>
    set((state) => ({
      uploads: state.uploads.filter((u) => u.id !== id),
    })),
  clearCompleted: () =>
    set((state) => ({
      uploads: state.uploads.filter((u) => u.status !== "completed"),
    })),
}));
