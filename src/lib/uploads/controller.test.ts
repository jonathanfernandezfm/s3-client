import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  enqueueUploads,
  pauseUpload,
  resumeUpload,
  cancelUpload,
  removeUpload,
  clearFinishedUploads,
  setUploaderFactory,
  resetUploadsForTest,
  type UploaderHandle,
} from "./controller";
import type { UploaderCallbacks } from "./uploader";
import { useUploadStore } from "@/lib/stores/upload-store";

class FakeUploader implements UploaderHandle {
  startCalls = 0;
  pauseCalls = 0;
  cancelCalls = 0;

  constructor(public callbacks: UploaderCallbacks) {}

  start(): Promise<void> {
    this.startCalls++;
    // Mirror the real FileUploader: status flips to uploading synchronously.
    this.callbacks.onStatus("uploading");
    return new Promise(() => {}); // stays in flight until the test drives callbacks
  }

  pause(): void {
    this.pauseCalls++;
    this.callbacks.onStatus("paused");
  }

  cancel(): Promise<void> {
    this.cancelCalls++;
    this.callbacks.onStatus("canceled");
    return Promise.resolve();
  }
}

function makeFile(name: string): File {
  return new File([new Uint8Array(4)], name);
}

describe("upload controller", () => {
  const fakes = new Map<string, FakeUploader>();

  beforeEach(() => {
    resetUploadsForTest();
    fakes.clear();
    setUploaderFactory((_file, target, callbacks) => {
      const fake = new FakeUploader(callbacks);
      fakes.set(target.key, fake);
      return fake;
    });
  });

  afterEach(() => {
    setUploaderFactory(null);
    resetUploadsForTest();
  });

  function enqueue(names: string[], onComplete?: () => void) {
    enqueueUploads(
      names.map((name) => ({
        file: makeFile(name),
        connectionId: "c1",
        bucket: "b1",
        key: name,
        onComplete,
      }))
    );
  }

  function statuses(): Record<string, string> {
    return Object.fromEntries(
      useUploadStore.getState().items.map((i) => [i.key, i.status])
    );
  }

  it("starts at most 3 uploads concurrently; the rest stay queued", () => {
    enqueue(["f1", "f2", "f3", "f4", "f5"]);
    const s = statuses();
    expect(Object.values(s).filter((v) => v === "uploading")).toHaveLength(3);
    expect(s.f4).toBe("queued");
    expect(s.f5).toBe("queued");
  });

  it("starts the next queued upload when one completes", () => {
    enqueue(["f1", "f2", "f3", "f4"]);
    fakes.get("f1")!.callbacks.onStatus("completed");
    expect(statuses().f1).toBe("completed");
    expect(statuses().f4).toBe("uploading");
  });

  it("invokes onComplete when an upload completes", () => {
    let completed = 0;
    enqueue(["f1"], () => completed++);
    fakes.get("f1")!.callbacks.onStatus("completed");
    expect(completed).toBe(1);
  });

  it("pausing frees a slot for the next queued upload", () => {
    enqueue(["f1", "f2", "f3", "f4"]);
    pauseUpload(useUploadStore.getState().items.find((i) => i.key === "f1")!.id);
    expect(statuses().f1).toBe("paused");
    expect(statuses().f4).toBe("uploading");
  });

  it("resume re-queues a paused upload and starts it when a slot is free", () => {
    enqueue(["f1"]);
    const id = useUploadStore.getState().items[0].id;
    pauseUpload(id);
    expect(statuses().f1).toBe("paused");
    resumeUpload(id);
    expect(statuses().f1).toBe("uploading");
    expect(fakes.get("f1")!.startCalls).toBe(2);
  });

  it("resume also retries errored uploads", () => {
    enqueue(["f1"]);
    const id = useUploadStore.getState().items[0].id;
    fakes.get("f1")!.callbacks.onStatus("error", "boom");
    resumeUpload(id);
    expect(statuses().f1).toBe("uploading");
  });

  it("cancel on a queued item cancels locally without starting it", () => {
    enqueue(["f1", "f2", "f3", "f4"]);
    const id = useUploadStore.getState().items.find((i) => i.key === "f4")!.id;
    cancelUpload(id);
    expect(statuses().f4).toBe("canceled");
    expect(fakes.get("f4")!.startCalls).toBe(0);
    expect(fakes.get("f4")!.cancelCalls).toBe(0);
  });

  it("cancel on an uploading item delegates to the uploader", () => {
    enqueue(["f1"]);
    const id = useUploadStore.getState().items[0].id;
    cancelUpload(id);
    expect(fakes.get("f1")!.cancelCalls).toBe(1);
    expect(statuses().f1).toBe("canceled");
  });

  it("progress callbacks update item.loaded", () => {
    enqueue(["f1"]);
    fakes.get("f1")!.callbacks.onProgress(2);
    expect(useUploadStore.getState().items[0].loaded).toBe(2);
  });

  it("removeUpload only removes finished items", () => {
    enqueue(["f1"]);
    const id = useUploadStore.getState().items[0].id;
    removeUpload(id); // uploading — refused
    expect(useUploadStore.getState().items).toHaveLength(1);
    fakes.get("f1")!.callbacks.onStatus("completed");
    removeUpload(id);
    expect(useUploadStore.getState().items).toHaveLength(0);
  });

  it("clearFinishedUploads clears finished items from store and registry", () => {
    enqueue(["f1", "f2"]);
    fakes.get("f1")!.callbacks.onStatus("completed");
    clearFinishedUploads();
    const keys = useUploadStore.getState().items.map((i) => i.key);
    expect(keys).toEqual(["f2"]);
  });

  it("cancel on a finished item is a no-op", () => {
    enqueue(["f1"]);
    const id = useUploadStore.getState().items[0].id;
    fakes.get("f1")!.callbacks.onStatus("completed");
    cancelUpload(id);
    expect(statuses().f1).toBe("completed");
    expect(fakes.get("f1")!.cancelCalls).toBe(0);
  });

  it("ignores status callbacks after an item reached a terminal state", () => {
    enqueue(["f1"]);
    fakes.get("f1")!.callbacks.onStatus("canceled");
    fakes.get("f1")!.callbacks.onStatus("paused"); // stale, must be ignored
    expect(statuses().f1).toBe("canceled");
  });
});
