import {
  useUploadStore,
  FINISHED_STATUSES,
} from "@/lib/stores/upload-store";
import { FileUploader, type UploaderCallbacks } from "./uploader";
import { createUpload, signParts, completeUpload, abortUpload } from "./api";
import { putBlob } from "./transport";
import type { UploadTarget } from "./types";

const MAX_ACTIVE_FILES = 3;

export interface UploaderHandle {
  start: () => Promise<void>;
  pause: () => void;
  cancel: () => Promise<void>;
}

export type UploaderFactory = (
  file: File,
  target: UploadTarget,
  callbacks: UploaderCallbacks
) => UploaderHandle;

const defaultFactory: UploaderFactory = (file, target, callbacks) =>
  new FileUploader(
    file,
    target,
    { createUpload, signParts, putBlob, completeUpload, abortUpload },
    callbacks
  );

let factory: UploaderFactory = defaultFactory;

/** Test-only: swap the uploader implementation. Pass null to restore the default. */
export function setUploaderFactory(f: UploaderFactory | null): void {
  factory = f ?? defaultFactory;
}

const uploaders = new Map<string, UploaderHandle>();
const completionCallbacks = new Map<string, () => void>();
let nextId = 0;

/** Test-only: clear registries and store state. */
export function resetUploadsForTest(): void {
  uploaders.clear();
  completionCallbacks.clear();
  nextId = 0;
  useUploadStore.setState({ items: [] });
}

export interface EnqueueInput {
  file: File;
  connectionId: string;
  bucket: string;
  key: string;
  onComplete?: () => void;
}

export function enqueueUploads(inputs: EnqueueInput[]): void {
  const { addItem } = useUploadStore.getState();
  for (const input of inputs) {
    const id = `upload-${++nextId}`;
    const target: UploadTarget = {
      connectionId: input.connectionId,
      bucket: input.bucket,
      key: input.key,
    };
    const uploader = factory(input.file, target, {
      onProgress: (loaded) =>
        useUploadStore.getState().updateItem(id, { loaded }),
      onStatus: (status, error) => {
        useUploadStore.getState().updateItem(id, { status, error });
        if (status === "completed") {
          completionCallbacks.get(id)?.();
        }
        if (status !== "uploading") {
          pump();
        }
      },
    });
    uploaders.set(id, uploader);
    if (input.onComplete) completionCallbacks.set(id, input.onComplete);
    addItem({
      id,
      fileName: input.file.name,
      size: input.file.size,
      ...target,
      status: "queued",
      loaded: 0,
    });
  }
  pump();
}

function pump(): void {
  const { items } = useUploadStore.getState();
  const active = items.filter((i) => i.status === "uploading").length;
  let slots = MAX_ACTIVE_FILES - active;
  for (const item of items) {
    if (slots <= 0) return;
    if (item.status !== "queued") continue;
    const uploader = uploaders.get(item.id);
    if (!uploader) continue;
    slots--;
    // FileUploader.start() flips status to "uploading" synchronously,
    // so later pump() calls see fresh state and never double-start.
    void uploader.start();
  }
}

export function pauseUpload(id: string): void {
  uploaders.get(id)?.pause();
}

/** Resumes a paused upload, or retries an errored one. */
export function resumeUpload(id: string): void {
  const item = useUploadStore.getState().items.find((i) => i.id === id);
  if (!item || (item.status !== "paused" && item.status !== "error")) return;
  useUploadStore.getState().updateItem(id, { status: "queued", error: undefined });
  pump();
}

export function cancelUpload(id: string): void {
  const item = useUploadStore.getState().items.find((i) => i.id === id);
  if (!item) return;
  if (item.status === "queued") {
    // Never started — nothing remote to abort.
    useUploadStore.getState().updateItem(id, { status: "canceled" });
    pump();
    return;
  }
  void uploaders.get(id)?.cancel();
}

/** Removes a finished item from the panel. Active items must be canceled first. */
export function removeUpload(id: string): void {
  const item = useUploadStore.getState().items.find((i) => i.id === id);
  if (!item || !FINISHED_STATUSES.includes(item.status)) return;
  cleanup(id);
  useUploadStore.getState().removeItem(id);
}

export function clearFinishedUploads(): void {
  const { items } = useUploadStore.getState();
  for (const item of items) {
    if (FINISHED_STATUSES.includes(item.status)) cleanup(item.id);
  }
  useUploadStore.getState().clearFinished();
}

function cleanup(id: string): void {
  uploaders.delete(id);
  completionCallbacks.delete(id);
}
