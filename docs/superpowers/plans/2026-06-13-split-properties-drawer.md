# Split Properties Into Its Own Drawer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Properties tab out of the shared info drawer into its own dedicated, always-file-scoped right drawer; keep Activity/Notes/Versions in the info drawer with a visible, dismissible file subject reached via explicit file-menu actions.

**Architecture:** Two independent Zustand-backed right drawers that are mutually exclusive (opening one closes the other). A new `properties-drawer-store` + `PropertiesDrawer` component own file properties. The existing `info-drawer-store`/`InfoDrawer` lose the `properties` tab, clear `objectKey` on close, and gain a removable subject chip. File 3-dots menus repoint "Properties" to the new drawer and gain "Activity" and "Versions" items that file-scope the info drawer.

**Tech Stack:** Next.js 16 / React 19, Zustand, TanStack React Query, Tailwind, lucide-react, Vitest (`node` env, `// @vitest-environment jsdom` per file when DOM is needed).

**Spec:** `docs/superpowers/specs/2026-06-13-split-properties-drawer-design.md`

---

## File Structure

**Create:**
- `src/lib/stores/properties-drawer-store.ts` — new store: `{ isOpen, scope: {connectionId,bucket,objectKey}|null, open(scope), close() }`. `open()` also closes the info drawer.
- `src/components/properties-drawer/properties-drawer.tsx` — new drawer component (chrome + body). Houses the moved `PropertiesForm` and `PropertiesContent`.
- `src/lib/stores/properties-drawer-store.test.ts` — store unit tests.
- `src/lib/stores/info-drawer-store.test.ts` — store unit tests for the changed behavior.

**Modify:**
- `src/lib/stores/info-drawer-store.ts` — drop `"properties"` from `InfoDrawerTab`; `close()`/`toggle()`-close clear `objectKey`; `open()`/`toggle()`-open close the properties drawer.
- `src/components/info-drawer/info-drawer.tsx` — remove Properties tab + import; add removable file-subject chip; destructure `setScope`.
- `src/components/browser/file-row.tsx` — repoint Properties to new store; add Activity + Versions menu items.
- `src/components/browser/file-tile.tsx` — same as file-row.
- `src/app/app/layout.tsx` — mount `<PropertiesDrawer />`.

**Delete:**
- `src/components/info-drawer/properties-tab.tsx` — its content moves into the properties drawer.

**Note on circular imports:** the two stores reference each other only inside action functions via `getState()` (never at module top level), so the ESM circular import is safe — both modules are fully initialized before any action runs.

---

## Task 1: Create the properties-drawer store

**Files:**
- Create: `src/lib/stores/properties-drawer-store.ts`
- Test: `src/lib/stores/properties-drawer-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/stores/properties-drawer-store.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/stores/properties-drawer-store.test.ts`
Expected: FAIL — cannot resolve `./properties-drawer-store` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/stores/properties-drawer-store.ts
import { create } from "zustand";
import { useInfoDrawerStore } from "./info-drawer-store";

export type PropertiesDrawerScope = {
  connectionId: string;
  bucket: string;
  objectKey: string;
};

interface PropertiesDrawerState {
  isOpen: boolean;
  scope: PropertiesDrawerScope | null;
  open: (scope: PropertiesDrawerScope) => void;
  close: () => void;
}

export const usePropertiesDrawerStore = create<PropertiesDrawerState>((set) => ({
  isOpen: false,
  scope: null,

  open: (scope) => {
    // Mutually exclusive with the info drawer (shared right edge).
    useInfoDrawerStore.getState().close();
    set({ isOpen: true, scope });
  },

  close: () => set({ isOpen: false }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/stores/properties-drawer-store.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/properties-drawer-store.ts src/lib/stores/properties-drawer-store.test.ts
git commit -m "feat(properties-drawer): add file-scoped properties drawer store"
```

---

## Task 2: Update the info-drawer store

Drop the `properties` tab from the type, clear `objectKey` whenever the drawer closes, and close the properties drawer whenever the info drawer opens.

**Files:**
- Modify: `src/lib/stores/info-drawer-store.ts`
- Test: `src/lib/stores/info-drawer-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/stores/info-drawer-store.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { useInfoDrawerStore } from "./info-drawer-store";
import { usePropertiesDrawerStore } from "./properties-drawer-store";

const fileScope = {
  connectionId: "c1",
  bucket: "b1",
  prefix: "folder/",
  objectKey: "folder/a.txt",
};

describe("info-drawer-store", () => {
  beforeEach(() => {
    useInfoDrawerStore.setState({
      isOpen: false,
      activeTab: "activity",
      scope: null,
      userFilter: null,
      actionFilter: null,
    });
    usePropertiesDrawerStore.setState({ isOpen: false, scope: null });
  });

  it("close() clears objectKey but keeps folder context", () => {
    useInfoDrawerStore.setState({ isOpen: true, scope: fileScope });
    useInfoDrawerStore.getState().close();

    const s = useInfoDrawerStore.getState();
    expect(s.isOpen).toBe(false);
    expect(s.scope).toEqual({
      connectionId: "c1",
      bucket: "b1",
      prefix: "folder/",
      objectKey: undefined,
    });
  });

  it("close() leaves scope null when there was no scope", () => {
    useInfoDrawerStore.getState().close();
    expect(useInfoDrawerStore.getState().scope).toBeNull();
  });

  it("open() closes the properties drawer (mutual exclusivity)", () => {
    usePropertiesDrawerStore.setState({
      isOpen: true,
      scope: { connectionId: "c1", bucket: "b1", objectKey: "a.txt" },
    });

    useInfoDrawerStore.getState().open("activity");

    expect(usePropertiesDrawerStore.getState().isOpen).toBe(false);
    expect(useInfoDrawerStore.getState().isOpen).toBe(true);
  });

  it("toggle() to close clears objectKey", () => {
    useInfoDrawerStore.setState({ isOpen: true, scope: fileScope });
    useInfoDrawerStore.getState().toggle("activity"); // open + same tab => close

    const s = useInfoDrawerStore.getState();
    expect(s.isOpen).toBe(false);
    expect(s.scope?.objectKey).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/stores/info-drawer-store.test.ts`
Expected: FAIL — `close()` currently does not clear `objectKey`, and `open()` does not touch the properties drawer.

- [ ] **Step 3: Write minimal implementation**

Edit `src/lib/stores/info-drawer-store.ts`.

3a. Drop `"properties"` from the tab union (line 4):

```ts
export type InfoDrawerTab = "activity" | "notes" | "versions";
```

3b. Add a lazy import of the properties store. Place it with the other imports at the top, **after** the `create` import:

```ts
import { create } from "zustand";
import type { ActivityAction } from "@/generated/prisma/client";
import { usePropertiesDrawerStore } from "./properties-drawer-store";
```

3c. Add a private helper inside the store factory that clears `objectKey` from the current scope, and rewrite `open`, `close`, and `toggle`. Replace the existing `open`/`close`/`toggle` implementations (lines 37-57) with:

```ts
  open: (tab) => {
    usePropertiesDrawerStore.getState().close();
    set((state) => ({
      isOpen: true,
      activeTab: tab ?? state.activeTab,
    }));
  },

  close: () =>
    set((state) => ({
      isOpen: false,
      userFilter: null,
      actionFilter: null,
      scope: state.scope ? { ...state.scope, objectKey: undefined } : null,
    })),

  toggle: (tab) => {
    const state = get();
    if (state.isOpen) {
      if (tab && state.activeTab !== tab) {
        set({ activeTab: tab });
      } else {
        set({
          isOpen: false,
          userFilter: null,
          actionFilter: null,
          scope: state.scope ? { ...state.scope, objectKey: undefined } : null,
        });
      }
    } else {
      usePropertiesDrawerStore.getState().close();
      set({ isOpen: true, activeTab: tab ?? state.activeTab });
    }
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/stores/info-drawer-store.test.ts src/lib/stores/properties-drawer-store.test.ts`
Expected: PASS (both files green — confirms the circular `getState()` reference works both ways).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/info-drawer-store.ts src/lib/stores/info-drawer-store.test.ts
git commit -m "feat(info-drawer): clear file subject on close, exclude properties tab"
```

---

## Task 3: Create the PropertiesDrawer component

Move the existing `PropertiesTab` content into a self-contained drawer that reads the new store. The form logic is copied verbatim; only the wrapper (scope source, empty-state, drawer chrome) changes.

**Files:**
- Create: `src/components/properties-drawer/properties-drawer.tsx`
- Reference (copy form from): `src/components/info-drawer/properties-tab.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/properties-drawer/properties-drawer.tsx` with the full content below. The `PropertiesForm` function and the `sseLabel` helper and the two constant arrays are copied **unchanged** from `properties-tab.tsx`; the wrapper is new.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { usePropertiesDrawerStore } from "@/lib/stores/properties-drawer-store";
import { useObjectHead, useUpdateObjectMetadata } from "@/lib/queries/objects";
import { useConnections } from "@/lib/queries/connections";
import { useBucketVersioning } from "@/lib/queries/buckets";
import { canManageFiles } from "@/lib/roles";
import { formatBytes, formatDate } from "@/lib/utils";
import type { ObjectProperties } from "@/types";

const CONTENT_TYPE_SUGGESTIONS = [
  "application/json",
  "application/octet-stream",
  "application/pdf",
  "application/zip",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "text/css",
  "text/csv",
  "text/html",
  "text/javascript",
  "text/plain",
  "video/mp4",
];

const STORAGE_CLASSES = [
  "STANDARD",
  "STANDARD_IA",
  "ONEZONE_IA",
  "INTELLIGENT_TIERING",
  "GLACIER_IR",
  "GLACIER",
  "DEEP_ARCHIVE",
  "REDUCED_REDUNDANCY",
];

const MAX_COPY_SIZE = 5 * 1024 * 1024 * 1024;

function sseLabel(p: ObjectProperties): string {
  if (!p.serverSideEncryption) return "None";
  if (p.serverSideEncryption === "AES256") return "SSE-S3 (AES256)";
  if (p.serverSideEncryption === "aws:kms")
    return `SSE-KMS${p.sseKmsKeyId ? ` · …${p.sseKmsKeyId.slice(-12)}` : ""}`;
  return p.serverSideEncryption;
}

export function PropertiesDrawer() {
  const { isOpen, scope, close } = usePropertiesDrawerStore();

  const connectionId = scope?.connectionId ?? "";
  const bucket = scope?.bucket ?? "";
  const objectKey = scope?.objectKey ?? "";
  const fileName = objectKey.split("/").filter(Boolean).pop() ?? objectKey;

  const head = useObjectHead(connectionId, bucket, objectKey);
  const { data: connections = [] } = useConnections();
  const connection = connections.find((c) => c.id === connectionId);
  const canWrite = canManageFiles(connection?.role ?? null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  return (
    <>
      {isOpen && (
        <div
          aria-hidden
          style={{ position: "fixed", inset: 0, zIndex: 39 }}
          onClick={close}
        />
      )}
      <div
        aria-label="Properties drawer"
        aria-hidden={!isOpen}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: 380,
          zIndex: 40,
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
          pointerEvents: isOpen ? "auto" : "none",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        className="bg-background border-l border-border shadow-xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Properties</h2>
            </div>
            {fileName && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[260px]">
                {fileName}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={close}
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Body */}
        {!objectKey ? null : head.isLoading ? (
          <div className="p-4 text-xs text-muted-foreground">
            Loading properties…
          </div>
        ) : head.isError || !head.data ? (
          <div className="p-4 text-xs text-destructive">
            {head.error instanceof Error
              ? head.error.message
              : "Failed to load properties"}
          </div>
        ) : (
          <PropertiesForm
            key={`${objectKey}:${head.data.etag ?? ""}`}
            connectionId={connectionId}
            bucket={bucket}
            objectKey={objectKey}
            properties={head.data}
            canWrite={canWrite}
          />
        )}
      </div>
    </>
  );
}

type MetadataRow = { id: number; key: string; value: string };

function PropertiesForm({
  connectionId,
  bucket,
  objectKey,
  properties,
  canWrite,
}: {
  connectionId: string;
  bucket: string;
  objectKey: string;
  properties: ObjectProperties;
  canWrite: boolean;
}) {
  const { toast } = useToast();
  const updateMetadata = useUpdateObjectMetadata();
  const versioning = useBucketVersioning(connectionId, bucket);
  const versioningEnabled = versioning.data?.status === "Enabled";

  const nextRowId = useRef(0);
  const [contentType, setContentType] = useState(properties.contentType ?? "");
  const [cacheControl, setCacheControl] = useState(
    properties.cacheControl ?? ""
  );
  const [storageClass, setStorageClass] = useState(properties.storageClass);
  const [rows, setRows] = useState<MetadataRow[]>(() =>
    Object.entries(properties.metadata).map(([key, value]) => ({
      id: nextRowId.current++,
      key,
      value,
    }))
  );

  const restored =
    properties.restore?.includes('ongoing-request="false"') ?? false;
  const archived =
    (properties.storageClass === "GLACIER" ||
      properties.storageClass === "DEEP_ARCHIVE") &&
    !restored;
  const tooLarge = (properties.size ?? 0) > MAX_COPY_SIZE;
  const blockedReason = tooLarge
    ? "Objects larger than 5 GB cannot be edited in place."
    : archived
    ? "Restore this archived object before editing its metadata."
    : null;
  const editable = canWrite && !blockedReason;

  const initialMetadata = JSON.stringify(
    Object.entries(properties.metadata).sort()
  );
  const currentMetadata = JSON.stringify(
    rows
      .filter((r) => r.key.trim() !== "")
      .map((r) => [r.key.trim().toLowerCase(), r.value])
      .sort()
  );
  const isDirty =
    contentType !== (properties.contentType ?? "") ||
    cacheControl !== (properties.cacheControl ?? "") ||
    storageClass !== properties.storageClass ||
    currentMetadata !== initialMetadata;

  async function handleSave() {
    const metadata: Record<string, string> = {};
    for (const row of rows) {
      const key = row.key.trim().toLowerCase();
      if (!key) continue;
      if (key in metadata) {
        toast({
          title: "Duplicate metadata key",
          description: `"${key}" appears more than once.`,
          variant: "destructive",
        });
        return;
      }
      metadata[key] = row.value;
    }

    try {
      await updateMetadata.mutateAsync({
        connectionId,
        bucket,
        key: objectKey,
        contentType,
        cacheControl,
        metadata,
        storageClass,
      });
      toast({ title: "Properties saved" });
    } catch (err) {
      toast({
        title: "Couldn't save properties",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 py-3 border-b border-border">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Size</dt>
          <dd>
            {properties.size !== undefined
              ? formatBytes(properties.size)
              : "—"}
          </dd>
          <dt className="text-muted-foreground">Modified</dt>
          <dd>
            {properties.lastModified
              ? formatDate(properties.lastModified)
              : "—"}
          </dd>
          <dt className="text-muted-foreground">ETag</dt>
          <dd className="truncate font-mono">{properties.etag ?? "—"}</dd>
          {properties.versionId && (
            <>
              <dt className="text-muted-foreground">Version</dt>
              <dd className="truncate font-mono">{properties.versionId}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Encryption</dt>
          <dd>{sseLabel(properties)}</dd>
        </dl>
      </div>

      <div className="px-4 py-3 flex flex-col gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Content-Type</span>
          <Input
            list="content-type-suggestions"
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
            disabled={!editable}
            className="h-8 text-xs"
            placeholder="application/octet-stream"
          />
          <datalist id="content-type-suggestions">
            {CONTENT_TYPE_SUGGESTIONS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Cache-Control</span>
          <Input
            value={cacheControl}
            onChange={(e) => setCacheControl(e.target.value)}
            disabled={!editable}
            className="h-8 text-xs"
            placeholder="public, max-age=31536000"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Storage class</span>
          <select
            value={storageClass}
            onChange={(e) => setStorageClass(e.target.value)}
            disabled={!editable}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            {!STORAGE_CLASSES.includes(storageClass) && (
              <option value={storageClass}>{storageClass}</option>
            )}
            {STORAGE_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Custom metadata</span>
            {editable && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() =>
                  setRows((prev) => [
                    ...prev,
                    { id: nextRowId.current++, key: "", value: "" },
                  ])
                }
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            )}
          </div>
          {rows.length === 0 && (
            <p className="text-muted-foreground">No custom metadata.</p>
          )}
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-1">
              <Input
                value={row.key}
                placeholder="key"
                disabled={!editable}
                className="h-7 text-xs flex-1"
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, key: e.target.value } : r
                    )
                  )
                }
              />
              <Input
                value={row.value}
                placeholder="value"
                disabled={!editable}
                className="h-7 text-xs flex-[2]"
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, value: e.target.value } : r
                    )
                  )
                }
              />
              {editable && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() =>
                    setRows((prev) => prev.filter((r) => r.id !== row.id))
                  }
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {blockedReason && (
          <p className="text-muted-foreground">{blockedReason}</p>
        )}
        {editable && versioningEnabled && (
          <p className="text-muted-foreground">
            Saving rewrites the object and creates a new version.
          </p>
        )}
        {editable && (
          <Button
            size="sm"
            className="self-start h-7 px-3 text-xs"
            disabled={!isDirty || updateMetadata.isPending}
            onClick={handleSave}
          >
            {updateMetadata.isPending && (
              <Loader2 className="h-3 w-3 animate-spin" />
            )}
            Save changes
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks / lints**

Run: `pnpm lint`
Expected: no errors for `src/components/properties-drawer/properties-drawer.tsx`. (The old `properties-tab.tsx` is still present and unused at this point — that's fine; it is removed in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add src/components/properties-drawer/properties-drawer.tsx
git commit -m "feat(properties-drawer): add standalone properties drawer component"
```

---

## Task 4: Mount the drawer and strip Properties from the info drawer

**Files:**
- Modify: `src/app/app/layout.tsx`
- Modify: `src/components/info-drawer/info-drawer.tsx`

- [ ] **Step 1: Mount PropertiesDrawer in the layout**

In `src/app/app/layout.tsx`, add the import after the `InfoDrawer` import (line 7):

```tsx
import { InfoDrawer } from "@/components/info-drawer/info-drawer";
import { PropertiesDrawer } from "@/components/properties-drawer/properties-drawer";
```

And render it right after `<InfoDrawer />` (line 27):

```tsx
      <InfoDrawer />
      <PropertiesDrawer />
```

- [ ] **Step 2: Remove the Properties tab from the info drawer**

In `src/components/info-drawer/info-drawer.tsx`:

2a. Remove the `PropertiesTab` import (line 20) and the `SlidersHorizontal` icon import (line 9). The remaining icon imports are `X, Activity, MessageSquare, History`.

2b. Remove the `properties` entry from `TAB_META` (lines 22-27 become):

```tsx
const TAB_META: Record<InfoDrawerTab, { label: string; icon: LucideIcon }> = {
  activity: { label: "Activity", icon: Activity },
  notes: { label: "Notes", icon: MessageSquare },
  versions: { label: "Versions", icon: History },
};
```

2c. Remove `"properties"` from `TAB_ORDER`:

```tsx
const TAB_ORDER: InfoDrawerTab[] = ["activity", "notes", "versions"];
```

2d. In the body conditional (lines 138-146), remove the Properties branch so Versions is the final fallback:

```tsx
        ) : activeTab === "activity" ? (
          <ActivityTab />
        ) : activeTab === "notes" ? (
          <NotesTab />
        ) : (
          <VersionsTab />
        )}
```

- [ ] **Step 3: Add the removable file-subject chip**

In `src/components/info-drawer/info-drawer.tsx`:

3a. Add `File` to the lucide import line and pull `setScope` from the store. Update the destructure (line 37):

```tsx
  const { isOpen, scope, activeTab, setActiveTab, setScope, close } =
    useInfoDrawerStore();
```

3b. Derive the file label. After the existing `scopeLabel` block (after line 46), add:

```tsx
  const fileSubject = scope?.objectKey
    ? scope.objectKey.split("/").filter(Boolean).pop() ?? scope.objectKey
    : null;
```

3c. In the header `<div className="min-w-0">` block, replace the existing `scopeLabel` paragraph (lines 94-98) with a folder breadcrumb plus a removable file chip:

```tsx
            {scopeLabel && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[260px]">
                {scopeLabel}
              </p>
            )}
            {fileSubject && (
              <button
                type="button"
                onClick={() =>
                  scope && setScope({ ...scope, objectKey: undefined })
                }
                className="mt-1 inline-flex items-center gap-1 max-w-[260px] rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
                title="Show folder activity instead"
              >
                <File className="h-3 w-3 shrink-0" />
                <span className="truncate">{fileSubject}</span>
                <X className="h-3 w-3 shrink-0" />
              </button>
            )}
```

Add `File` to the lucide-react import at the top (line 4-11 import block):

```tsx
import {
  X,
  Activity,
  MessageSquare,
  History,
  File,
  type LucideIcon,
} from "lucide-react";
```

Note: `scopeLabel` already includes the objectKey in its `bucket / objectKey` form; that is acceptable — the breadcrumb shows the full path and the chip provides the dismiss affordance. No change needed to `scopeLabel` itself.

- [ ] **Step 4: Verify build/lint**

Run: `pnpm lint`
Expected: no errors. No remaining references to `PropertiesTab` or `SlidersHorizontal` in `info-drawer.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/layout.tsx src/components/info-drawer/info-drawer.tsx
git commit -m "feat(info-drawer): mount properties drawer, drop properties tab, add subject chip"
```

---

## Task 5: Repoint the file-row menu

Change "Properties" to open the new drawer, and add "Activity" and "Versions" items that file-scope the info drawer.

**Files:**
- Modify: `src/components/browser/file-row.tsx`

- [ ] **Step 1: Add imports and store hooks**

5a. Add the properties-drawer store import near the existing info-drawer store import (line 32 area):

```tsx
import { useInfoDrawerStore } from "@/lib/stores/info-drawer-store";
import { usePropertiesDrawerStore } from "@/lib/stores/properties-drawer-store";
```

5b. Add `Activity` to the lucide-react icon import in this file (it already imports `History`, `SlidersHorizontal`). Add `Activity` to that import list.

5c. Add the open hook beside the existing `setInfoScope`/`openInfoDrawer` (after line 132):

```tsx
  const setInfoScope = useInfoDrawerStore((s) => s.setScope);
  const openInfoDrawer = useInfoDrawerStore((s) => s.open);
  const openPropertiesDrawer = usePropertiesDrawerStore((s) => s.open);
```

- [ ] **Step 2: Repoint `handleOpenProperties` and add scope helpers**

Replace the existing `handleOpenProperties` (lines 134-141ish, the whole function) with these three handlers:

```tsx
  const handleOpenProperties = () => {
    openPropertiesDrawer({ connectionId, bucket, objectKey: object.key });
  };

  const handleOpenActivity = () => {
    setInfoScope({
      connectionId,
      bucket,
      prefix: currentPath || undefined,
      objectKey: object.key,
    });
    openInfoDrawer("activity");
  };

  const handleOpenVersions = () => {
    setInfoScope({
      connectionId,
      bucket,
      prefix: currentPath || undefined,
      objectKey: object.key,
    });
    openInfoDrawer("versions");
  };
```

- [ ] **Step 3: Add the two new menu items**

In the `DropdownMenuContent`, immediately after the Properties `DropdownMenuItem` (the block at lines 304-309), insert Activity (always available for files) and Versions (only when `hasVersioning`):

```tsx
              {!object.isFolder && (
                <DropdownMenuItem onClick={handleOpenProperties}>
                  <SlidersHorizontal className="h-4 w-4" />
                  Properties
                </DropdownMenuItem>
              )}
              {!object.isFolder && (
                <DropdownMenuItem onClick={handleOpenActivity}>
                  <Activity className="h-4 w-4" />
                  Activity
                </DropdownMenuItem>
              )}
              {hasVersioning && !object.isFolder && (
                <DropdownMenuItem onClick={handleOpenVersions}>
                  <History className="h-4 w-4" />
                  Versions
                </DropdownMenuItem>
              )}
```

Note: the existing `History` "History" item (lines 323-336) opens the full `VersionHistoryDialog` and is left **unchanged** — "Versions" (drawer, quick list) and "History" (dialog, full management) are intentionally distinct.

- [ ] **Step 4: Verify lint**

Run: `pnpm lint`
Expected: no errors; `Activity` and `usePropertiesDrawerStore` are both used.

- [ ] **Step 5: Commit**

```bash
git add src/components/browser/file-row.tsx
git commit -m "feat(file-row): open properties drawer; add Activity/Versions menu items"
```

---

## Task 6: Repoint the file-tile menu

Mirror Task 5 in the grid/tile view.

**Files:**
- Modify: `src/components/browser/file-tile.tsx`

- [ ] **Step 1: Add imports and store hooks**

6a. Add the properties-drawer store import next to the info-drawer store import (line 22 area):

```tsx
import { usePropertiesDrawerStore } from "@/lib/stores/properties-drawer-store";
```

6b. Add `Activity` to the lucide-react import on line 7 (which already includes `History, SlidersHorizontal`).

6c. Add the open hook after the existing info-drawer hooks (after line 107):

```tsx
  const openPropertiesDrawer = usePropertiesDrawerStore((s) => s.open);
```

- [ ] **Step 2: Repoint `handleOpenProperties` and add scope helpers**

Replace the existing `handleOpenProperties` (lines 109-112) with:

```tsx
  const handleOpenProperties = () => {
    openPropertiesDrawer({ connectionId, bucket, objectKey: object.key });
  };

  const handleOpenActivity = () => {
    setInfoScope({
      connectionId,
      bucket,
      prefix: currentPath || undefined,
      objectKey: object.key,
    });
    openInfoDrawer("activity");
  };

  const handleOpenVersions = () => {
    setInfoScope({
      connectionId,
      bucket,
      prefix: currentPath || undefined,
      objectKey: object.key,
    });
    openInfoDrawer("versions");
  };
```

- [ ] **Step 3: Add the two new menu items**

After the Properties `DropdownMenuItem` (lines 330-333), insert:

```tsx
              <DropdownMenuItem onClick={handleOpenProperties}>
                <SlidersHorizontal className="h-4 w-4" />
                Properties
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenActivity}>
                <Activity className="h-4 w-4" />
                Activity
              </DropdownMenuItem>
              {hasVersioning && (
                <DropdownMenuItem onClick={handleOpenVersions}>
                  <History className="h-4 w-4" />
                  Versions
                </DropdownMenuItem>
              )}
```

(The existing `History` "History" item at lines 334-341 stays unchanged.)

- [ ] **Step 4: Verify lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/browser/file-tile.tsx
git commit -m "feat(file-tile): open properties drawer; add Activity/Versions menu items"
```

---

## Task 7: Remove the dead PropertiesTab and final verification

**Files:**
- Delete: `src/components/info-drawer/properties-tab.tsx`

- [ ] **Step 1: Confirm nothing imports the old tab**

Run: `git grep -n "properties-tab\|PropertiesTab"`
Expected: **no matches** (Task 4 removed the only import). If any match remains, fix it before deleting.

- [ ] **Step 2: Delete the file**

```bash
git rm src/components/info-drawer/properties-tab.tsx
```

- [ ] **Step 3: Full test + lint + build**

Run: `pnpm vitest run src/lib/stores/`
Expected: PASS — both store test files green.

Run: `pnpm lint`
Expected: no errors.

Run: `pnpm build`
Expected: build succeeds (Prisma generate + Next build). This is the real type-check gate for the React components.

- [ ] **Step 4: Manual smoke test**

Run `pnpm dev`, open a bucket with files, and verify:
1. File 3-dots → **Properties** opens the new right drawer titled "Properties" with the filename; the info drawer is not used.
2. File 3-dots → **Activity** opens the info drawer on Activity with a removable file chip in the header; clicking the chip (✕) returns the feed to folder scope.
3. File 3-dots → **Versions** (versioned bucket) opens the info drawer on Versions scoped to the file.
4. Open Properties, then click a toolbar info-drawer button (Activity/Notes/Versions) — the Properties drawer closes (mutual exclusivity), and the info drawer shows **folder** scope (no stale file).
5. Open Activity on a file, close the drawer, reopen Activity from the toolbar — it shows folder scope, not the previous file.
6. **History** menu item still opens the full version-history dialog (unchanged).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(info-drawer): remove migrated properties tab"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** two mutually-exclusive drawers (Tasks 1–4), properties always file-scoped (Tasks 1, 3), info-drawer file subject visible + dismissible (Task 4 chip), file scoping via explicit Activity/Versions menu items (Tasks 5–6), `close()` clears `objectKey` (Task 2), Notes unchanged (untouched), History dialog unchanged (Tasks 5–6 notes). All covered.
- **Type consistency:** `PropertiesDrawerScope` fields (`connectionId`, `bucket`, `objectKey`) match every `open({...})` call site (Tasks 1, 5, 6). `InfoDrawerTab` no longer contains `"properties"`, and no remaining code passes that value (Tasks 2, 4).
- **Notes tab:** continues to read `scope.prefix` only; setting `objectKey` via the new Activity/Versions items does not affect it. No change required.
