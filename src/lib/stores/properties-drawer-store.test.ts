import { beforeEach, describe, expect, it } from "vitest";
import { usePropertiesDrawerStore } from "./properties-drawer-store";
import { useInfoDrawerStore } from "./info-drawer-store";

describe("properties-drawer-store", () => {
  beforeEach(() => {
    usePropertiesDrawerStore.setState({ isOpen: false, scope: null });
    useInfoDrawerStore.setState({ isOpen: true });
  });

  it("open() sets a file scope and marks the drawer open", () => {
    usePropertiesDrawerStore
      .getState()
      .open({ connectionId: "c1", bucket: "b1", objectKey: "folder/a.txt" });

    const s = usePropertiesDrawerStore.getState();
    expect(s.isOpen).toBe(true);
    expect(s.scope).toEqual({
      connectionId: "c1",
      bucket: "b1",
      objectKey: "folder/a.txt",
    });
  });

  it("open() closes the info drawer (mutual exclusivity)", () => {
    usePropertiesDrawerStore
      .getState()
      .open({ connectionId: "c1", bucket: "b1", objectKey: "a.txt" });

    expect(useInfoDrawerStore.getState().isOpen).toBe(false);
  });

  it("close() hides the drawer but keeps scope", () => {
    usePropertiesDrawerStore
      .getState()
      .open({ connectionId: "c1", bucket: "b1", objectKey: "a.txt" });
    usePropertiesDrawerStore.getState().close();

    const s = usePropertiesDrawerStore.getState();
    expect(s.isOpen).toBe(false);
    expect(s.scope?.objectKey).toBe("a.txt");
  });
});
