import { describe, it, expect, beforeEach } from "vitest";
import { useUploadStore, type UploadItem } from "./upload-store";

function makeItem(overrides: Partial<UploadItem> = {}): UploadItem {
  return {
    id: "u1",
    fileName: "a.txt",
    size: 100,
    connectionId: "c1",
    bucket: "b1",
    key: "a.txt",
    status: "queued",
    loaded: 0,
    ...overrides,
  };
}

describe("upload-store", () => {
  beforeEach(() => {
    useUploadStore.setState({ items: [] });
  });

  it("adds items", () => {
    useUploadStore.getState().addItem(makeItem());
    expect(useUploadStore.getState().items).toHaveLength(1);
  });

  it("updates items by id", () => {
    useUploadStore.getState().addItem(makeItem());
    useUploadStore.getState().updateItem("u1", { status: "uploading", loaded: 50 });
    const item = useUploadStore.getState().items[0];
    expect(item.status).toBe("uploading");
    expect(item.loaded).toBe(50);
  });

  it("removes items by id", () => {
    useUploadStore.getState().addItem(makeItem());
    useUploadStore.getState().removeItem("u1");
    expect(useUploadStore.getState().items).toHaveLength(0);
  });

  it("clearFinished removes completed, error, and canceled items only", () => {
    const s = useUploadStore.getState();
    s.addItem(makeItem({ id: "a", status: "completed" }));
    s.addItem(makeItem({ id: "b", status: "error" }));
    s.addItem(makeItem({ id: "c", status: "canceled" }));
    s.addItem(makeItem({ id: "d", status: "uploading" }));
    s.addItem(makeItem({ id: "e", status: "queued" }));
    s.addItem(makeItem({ id: "f", status: "paused" }));
    useUploadStore.getState().clearFinished();
    expect(useUploadStore.getState().items.map((i) => i.id)).toEqual(["d", "e", "f"]);
  });
});
