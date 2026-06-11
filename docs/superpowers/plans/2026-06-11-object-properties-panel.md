# Object Properties Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Properties tab to the info drawer that shows an object's S3 metadata (Content-Type, Cache-Control, custom metadata, storage class, SSE status) and lets ADMIN users edit the first four in place.

**Architecture:** A new `POST /api/objects/head` route exposes `HeadObject` data; a new `POST /api/objects/metadata` route edits it via head-then-merge + `CopyObject` with `MetadataDirective: REPLACE` so unedited headers and SSE settings are never dropped. The merge logic is a pure function in `src/lib/s3/metadata.ts` (unit-tested). The drawer gains a fourth tab wired to `scope.objectKey`, which a new "Properties" item in the file row menu sets.

**Tech Stack:** Next.js 16 App Router API routes, AWS SDK v3, Prisma (new `ActivityAction` enum value), TanStack React Query, Zustand, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-object-properties-panel-design.md`

**Task order matters:** Task 2 (Prisma enum) must be done before Task 4 (route records `METADATA_CHANGE`). Task 1 before Task 4. Task 3 (types) before Tasks 4–7.

---

### Task 1: Metadata copy-params builder (pure logic, TDD)

**Files:**
- Create: `src/lib/s3/metadata.ts`
- Test: `src/lib/s3/metadata.test.ts`

This is the core merge logic: given a `HeadObject` result and the user's edits, produce the `CopyObjectCommand` input that applies the edits while preserving everything else. It also enforces the guardrails (no folders, no >5 GB objects, no unrestored archived objects, valid metadata keys/values).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/s3/metadata.test.ts`:

```ts
// src/lib/s3/metadata.test.ts
import { describe, test, expect } from "vitest";
import type { HeadObjectCommandOutput } from "@aws-sdk/client-s3";
import {
  buildMetadataCopyParams,
  MetadataEditError,
  MAX_COPY_SIZE,
  type MetadataEdits,
} from "./metadata";

function head(overrides: Partial<HeadObjectCommandOutput> = {}): HeadObjectCommandOutput {
  return { $metadata: {}, ContentLength: 1024, ...overrides };
}

function edits(overrides: Partial<MetadataEdits> = {}): MetadataEdits {
  return {
    contentType: "text/plain",
    cacheControl: "",
    metadata: {},
    storageClass: "STANDARD",
    ...overrides,
  };
}

describe("buildMetadataCopyParams", () => {
  test("applies edited fields and targets the same key", () => {
    const params = buildMetadataCopyParams("my-bucket", "docs/file.txt", head(), edits({
      contentType: "application/json",
      cacheControl: "public, max-age=3600",
      metadata: { owner: "alice" },
      storageClass: "STANDARD_IA",
    }));

    expect(params.Bucket).toBe("my-bucket");
    expect(params.Key).toBe("docs/file.txt");
    expect(params.CopySource).toBe(encodeURIComponent("my-bucket/docs/file.txt"));
    expect(params.MetadataDirective).toBe("REPLACE");
    expect(params.ContentType).toBe("application/json");
    expect(params.CacheControl).toBe("public, max-age=3600");
    expect(params.Metadata).toEqual({ owner: "alice" });
    expect(params.StorageClass).toBe("STANDARD_IA");
  });

  test("omits blank ContentType and CacheControl instead of sending empty strings", () => {
    const params = buildMetadataCopyParams("b", "k", head(), edits({
      contentType: "  ",
      cacheControl: "",
    }));
    expect("ContentType" in params).toBe(false);
    expect("CacheControl" in params).toBe(false);
  });

  test("defaults blank storage class to STANDARD", () => {
    const params = buildMetadataCopyParams("b", "k", head(), edits({ storageClass: " " }));
    expect(params.StorageClass).toBe("STANDARD");
  });

  test("preserves unedited headers from head", () => {
    const params = buildMetadataCopyParams("b", "k", head({
      ContentDisposition: 'attachment; filename="x.txt"',
      ContentEncoding: "gzip",
      ContentLanguage: "en",
      Expires: new Date("2030-01-01T00:00:00Z"),
    }), edits());
    expect(params.ContentDisposition).toBe('attachment; filename="x.txt"');
    expect(params.ContentEncoding).toBe("gzip");
    expect(params.ContentLanguage).toBe("en");
    expect(params.Expires).toEqual(new Date("2030-01-01T00:00:00Z"));
  });

  test("re-applies SSE-S3 without a KMS key id", () => {
    const params = buildMetadataCopyParams("b", "k", head({
      ServerSideEncryption: "AES256",
    }), edits());
    expect(params.ServerSideEncryption).toBe("AES256");
    expect("SSEKMSKeyId" in params).toBe(false);
  });

  test("re-applies SSE-KMS including the key id", () => {
    const params = buildMetadataCopyParams("b", "k", head({
      ServerSideEncryption: "aws:kms",
      SSEKMSKeyId: "arn:aws:kms:eu-west-1:123:key/abc",
    }), edits());
    expect(params.ServerSideEncryption).toBe("aws:kms");
    expect(params.SSEKMSKeyId).toBe("arn:aws:kms:eu-west-1:123:key/abc");
  });

  test("lowercases and trims metadata keys, skips empty keys", () => {
    const params = buildMetadataCopyParams("b", "k", head(), edits({
      metadata: { " Owner ": "alice", "": "ignored" },
    }));
    expect(params.Metadata).toEqual({ owner: "alice" });
  });

  test("rejects invalid metadata keys", () => {
    expect(() =>
      buildMetadataCopyParams("b", "k", head(), edits({ metadata: { "bad key!": "v" } }))
    ).toThrow(MetadataEditError);
  });

  test("rejects non-ASCII metadata values", () => {
    expect(() =>
      buildMetadataCopyParams("b", "k", head(), edits({ metadata: { owner: "ålice" } }))
    ).toThrow(MetadataEditError);
  });

  test("rejects folder keys", () => {
    expect(() =>
      buildMetadataCopyParams("b", "folder/", head(), edits())
    ).toThrow(MetadataEditError);
  });

  test("rejects objects larger than the single-part copy limit", () => {
    expect(() =>
      buildMetadataCopyParams("b", "k", head({ ContentLength: MAX_COPY_SIZE + 1 }), edits())
    ).toThrow(MetadataEditError);
  });

  test("rejects archived objects that are not restored", () => {
    expect(() =>
      buildMetadataCopyParams("b", "k", head({ StorageClass: "GLACIER" }), edits())
    ).toThrow(MetadataEditError);
    expect(() =>
      buildMetadataCopyParams("b", "k", head({ StorageClass: "DEEP_ARCHIVE" }), edits())
    ).toThrow(MetadataEditError);
  });

  test("allows archived objects with a completed restore", () => {
    const params = buildMetadataCopyParams("b", "k", head({
      StorageClass: "GLACIER",
      Restore: 'ongoing-request="false", expiry-date="Fri, 21 Dec 2026 00:00:00 GMT"',
    }), edits({ storageClass: "STANDARD" }));
    expect(params.StorageClass).toBe("STANDARD");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/s3/metadata.test.ts`
Expected: FAIL — cannot resolve `./metadata` (module does not exist yet).

- [ ] **Step 3: Implement `buildMetadataCopyParams`**

Create `src/lib/s3/metadata.ts`:

```ts
import type {
  CopyObjectCommandInput,
  HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";

export interface MetadataEdits {
  contentType: string;
  cacheControl: string;
  metadata: Record<string, string>;
  storageClass: string;
}

// Single-part CopyObject tops out at 5 GB; larger objects need multipart copy,
// which is out of scope for in-place metadata edits.
export const MAX_COPY_SIZE = 5 * 1024 * 1024 * 1024;

export class MetadataEditError extends Error {}

const METADATA_KEY_PATTERN = /^[a-z0-9._-]+$/;
const ASCII_PATTERN = /^[\x20-\x7e]*$/;

export function buildMetadataCopyParams(
  bucket: string,
  key: string,
  head: HeadObjectCommandOutput,
  edits: MetadataEdits
): CopyObjectCommandInput {
  if (key.endsWith("/")) {
    throw new MetadataEditError("Folders do not support metadata editing");
  }
  if ((head.ContentLength ?? 0) > MAX_COPY_SIZE) {
    throw new MetadataEditError(
      "Objects larger than 5 GB cannot be edited in place"
    );
  }
  const archived =
    head.StorageClass === "GLACIER" || head.StorageClass === "DEEP_ARCHIVE";
  const restored = head.Restore?.includes('ongoing-request="false"') ?? false;
  if (archived && !restored) {
    throw new MetadataEditError(
      "Archived objects must be restored before their metadata can be edited"
    );
  }

  const metadata: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(edits.metadata)) {
    const cleanKey = rawKey.trim().toLowerCase();
    if (!cleanKey) continue;
    if (!METADATA_KEY_PATTERN.test(cleanKey)) {
      throw new MetadataEditError(`Invalid metadata key: "${rawKey}"`);
    }
    if (!ASCII_PATTERN.test(value)) {
      throw new MetadataEditError(
        `Metadata value for "${rawKey}" must contain only ASCII characters`
      );
    }
    metadata[cleanKey] = value;
  }

  const contentType = edits.contentType.trim();
  const cacheControl = edits.cacheControl.trim();
  const storageClass = edits.storageClass.trim() || "STANDARD";

  return {
    Bucket: bucket,
    Key: key,
    CopySource: encodeURIComponent(`${bucket}/${key}`),
    MetadataDirective: "REPLACE",
    Metadata: metadata,
    StorageClass: storageClass as CopyObjectCommandInput["StorageClass"],
    ...(contentType ? { ContentType: contentType } : {}),
    ...(cacheControl ? { CacheControl: cacheControl } : {}),
    ...(head.ContentDisposition
      ? { ContentDisposition: head.ContentDisposition }
      : {}),
    ...(head.ContentEncoding ? { ContentEncoding: head.ContentEncoding } : {}),
    ...(head.ContentLanguage ? { ContentLanguage: head.ContentLanguage } : {}),
    ...(head.Expires ? { Expires: head.Expires } : {}),
    ...(head.ServerSideEncryption
      ? { ServerSideEncryption: head.ServerSideEncryption }
      : {}),
    ...(head.ServerSideEncryption === "aws:kms" && head.SSEKMSKeyId
      ? { SSEKMSKeyId: head.SSEKMSKeyId }
      : {}),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/s3/metadata.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/s3/metadata.ts src/lib/s3/metadata.test.ts
git commit -m "feat(s3): add metadata copy-params builder for in-place edits"
```

---

### Task 2: `METADATA_CHANGE` activity action (Prisma enum + UI labels)

**Files:**
- Modify: `prisma/schema.prisma:31-49` (`enum ActivityAction`)
- Modify: `src/components/info-drawer/activity-tab.tsx:16-54` (`ALL_ACTIONS`, `ACTION_LABELS`)
- Modify: `src/components/activity/event-format.ts:4-22` (`ACTION_VERBS`)

`ACTION_LABELS` and `ACTION_VERBS` are exhaustive `Record<ActivityAction, string>` maps, so TypeScript forces this task to be done together with the schema change.

- [ ] **Step 1: Add the enum value**

In `prisma/schema.prisma`, inside `enum ActivityAction`, add `METADATA_CHANGE` after `TAG_CHANGE`:

```prisma
enum ActivityAction {
  UPLOAD
  DELETE
  COPY
  MOVE
  RENAME
  FOLDER_CREATE
  TAG_CHANGE
  METADATA_CHANGE
  BUCKET_CREATE
  BUCKET_DELETE
  SHARE_CREATED
  SHARE_REVOKED
  MULTIPART_ABORT
  VERSION_RESTORE
  VERSION_UNDELETE
  VERSION_PURGE
  BUCKET_VERSIONING_ENABLE
  BUCKET_VERSIONING_SUSPEND
}
```

- [ ] **Step 2: Create the migration and regenerate the client**

Run: `pnpm prisma migrate dev --name add-metadata-change-action`
Expected: a new folder under `prisma/migrations/` containing `ALTER TYPE "ActivityAction" ADD VALUE ...`, and the Prisma client regenerated into `src/generated/prisma/`. (Requires the dev database from `.env` to be reachable.)

- [ ] **Step 3: Add the activity-tab filter entry and label**

In `src/components/info-drawer/activity-tab.tsx`, add to `ALL_ACTIONS` after `"TAG_CHANGE"`:

```ts
  "TAG_CHANGE",
  "METADATA_CHANGE",
```

and to `ACTION_LABELS` after the `TAG_CHANGE` entry:

```ts
  TAG_CHANGE: "Tag change",
  METADATA_CHANGE: "Metadata change",
```

- [ ] **Step 4: Add the activity verb**

In `src/components/activity/event-format.ts`, add to `ACTION_VERBS` after the `TAG_CHANGE` entry:

```ts
  TAG_CHANGE: "updated tags on",
  METADATA_CHANGE: "updated properties of",
```

- [ ] **Step 5: Verify the build type-checks**

Run: `pnpm lint && pnpm vitest run`
Expected: no errors (the exhaustive records now include the new action).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/components/info-drawer/activity-tab.tsx src/components/activity/event-format.ts
git commit -m "feat(activity): add METADATA_CHANGE action"
```

---

### Task 3: `ObjectProperties` type + `POST /api/objects/head` route

**Files:**
- Modify: `src/types/s3.ts` (append type)
- Create: `src/app/api/objects/head/route.ts`

- [ ] **Step 1: Add the shared type**

Append to `src/types/s3.ts`:

```ts
export interface ObjectProperties {
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  /** x-amz-meta-* entries, keys without the prefix (S3 returns them lowercased). */
  metadata: Record<string, string>;
  /** HeadObject omits StorageClass for STANDARD, so the API defaults it. */
  storageClass: string;
  serverSideEncryption?: string;
  sseKmsKeyId?: string;
  size?: number;
  etag?: string;
  lastModified?: string;
  versionId?: string;
  /** Raw x-amz-restore header for archived objects, when present. */
  restore?: string;
}
```

- [ ] **Step 2: Create the head route**

Create `src/app/api/objects/head/route.ts`:

```ts
import { NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import type { ObjectProperties } from "@/types";

export const POST = withAuth(async (req, { user }) => {
  try {
    const {
      connectionId,
      bucket,
      key,
    }: { connectionId: string; bucket: string; key: string } = await req.json();

    if (!connectionId || !bucket || !key) {
      return NextResponse.json(
        { error: "connectionId, bucket, and key are required" },
        { status: 400 }
      );
    }

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    const client = createS3Client(access.connection);
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );

    const properties: ObjectProperties = {
      contentType: head.ContentType,
      cacheControl: head.CacheControl,
      contentDisposition: head.ContentDisposition,
      contentEncoding: head.ContentEncoding,
      contentLanguage: head.ContentLanguage,
      metadata: head.Metadata ?? {},
      storageClass: head.StorageClass ?? "STANDARD",
      serverSideEncryption: head.ServerSideEncryption,
      sseKmsKeyId: head.SSEKMSKeyId,
      size: head.ContentLength,
      etag: head.ETag,
      lastModified: head.LastModified?.toISOString(),
      versionId: head.VersionId,
      restore: head.Restore,
    };

    return NextResponse.json(properties);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/s3.ts src/app/api/objects/head/route.ts
git commit -m "feat(api): add object head route returning S3 metadata"
```

---

### Task 4: `POST /api/objects/metadata` route

**Files:**
- Create: `src/app/api/objects/metadata/route.ts`

Depends on Task 1 (`buildMetadataCopyParams`) and Task 2 (`METADATA_CHANGE`).

- [ ] **Step 1: Create the route**

Create `src/app/api/objects/metadata/route.ts`:

```ts
import { NextResponse } from "next/server";
import { CopyObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { recordActivity } from "@/lib/db/activity";
import {
  buildMetadataCopyParams,
  MetadataEditError,
  type MetadataEdits,
} from "@/lib/s3/metadata";

interface UpdateMetadataRequest {
  connectionId: string;
  bucket: string;
  key: string;
  contentType: string;
  cacheControl: string;
  metadata: Record<string, string>;
  storageClass: string;
}

export const POST = withAuth(async (req, { user }) => {
  try {
    const {
      connectionId,
      bucket,
      key,
      contentType,
      cacheControl,
      metadata,
      storageClass,
    }: UpdateMetadataRequest = await req.json();

    if (
      !connectionId ||
      !bucket ||
      !key ||
      typeof metadata !== "object" ||
      metadata === null
    ) {
      return NextResponse.json(
        { error: "connectionId, bucket, key, and metadata are required" },
        { status: 400 }
      );
    }

    if (key.endsWith("/")) {
      return NextResponse.json(
        { error: "Folder metadata editing is not supported" },
        { status: 400 }
      );
    }

    const access = await getConnectionAccessById(connectionId, user.id);
    if (!access) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }
    if (access.role !== "ADMIN") {
      return NextResponse.json(
        { error: "You do not have permission to modify objects for this connection" },
        { status: 403 }
      );
    }

    const client = createS3Client(access.connection);
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );

    const edits: MetadataEdits = {
      contentType: contentType ?? "",
      cacheControl: cacheControl ?? "",
      metadata,
      storageClass: storageClass ?? "",
    };

    let params;
    try {
      params = buildMetadataCopyParams(bucket, key, head, edits);
    } catch (err) {
      if (err instanceof MetadataEditError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    await client.send(new CopyObjectCommand(params));

    await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName:
        [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "METADATA_CHANGE",
      bucket,
      key,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/objects/metadata/route.ts
git commit -m "feat(api): add object metadata update route (head-merge-copy)"
```

---

### Task 5: React Query hooks

**Files:**
- Modify: `src/lib/queries/objects.ts`

`queryKeys.objects.detail` already exists in `src/lib/queries/keys.ts:15-16` and is unused — these hooks adopt it. No key-factory changes needed.

- [ ] **Step 1: Add the hooks**

In `src/lib/queries/objects.ts`, change the types import (line 5) from:

```ts
import type { S3Object } from "@/types";
```

to:

```ts
import type { ObjectProperties, S3Object } from "@/types";
```

Then append at the end of the file:

```ts
async function fetchObjectHead(
  connectionId: string,
  bucket: string,
  key: string
): Promise<ObjectProperties> {
  const response = await fetch("/api/objects/head", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, bucket, key }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch object properties");
  }

  return response.json();
}

export function useObjectHead(
  connectionId: string,
  bucket: string,
  key: string
) {
  return useQuery({
    queryKey: queryKeys.objects.detail(connectionId, bucket, key),
    queryFn: () => fetchObjectHead(connectionId, bucket, key),
    enabled: !!connectionId && !!bucket && !!key,
  });
}

export interface UpdateObjectMetadataParams {
  connectionId: string;
  bucket: string;
  key: string;
  contentType: string;
  cacheControl: string;
  metadata: Record<string, string>;
  storageClass: string;
}

async function updateObjectMetadata(
  params: UpdateObjectMetadataParams
): Promise<{ success: boolean }> {
  const response = await fetch("/api/objects/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update object metadata");
  }

  return response.json();
}

export function useUpdateObjectMetadata() {
  const queryClient = useQueryClient();
  const invalidateActivity = useInvalidateActivity();

  return useMutation({
    mutationFn: updateObjectMetadata,
    onSuccess: () => {
      // objects.all covers both the list and detail keys.
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
      invalidateActivity();
    },
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/objects.ts
git commit -m "feat(queries): add object head query and metadata update mutation"
```

---

### Task 6: Drawer store tab + drawer shell registration

**Files:**
- Modify: `src/lib/stores/info-drawer-store.ts:4`
- Modify: `src/components/info-drawer/info-drawer.tsx` (full rewrite below)
- Create: `src/components/info-drawer/properties-tab.tsx` (stub; real content in Task 7)

- [ ] **Step 1: Extend the tab union**

In `src/lib/stores/info-drawer-store.ts`, change line 4 from:

```ts
export type InfoDrawerTab = "activity" | "notes" | "versions";
```

to:

```ts
export type InfoDrawerTab = "activity" | "notes" | "versions" | "properties";
```

- [ ] **Step 2: Create a stub properties tab**

Create `src/components/info-drawer/properties-tab.tsx`:

```tsx
"use client";

export function PropertiesTab() {
  return (
    <div className="p-4 text-xs text-muted-foreground">
      Select a file and choose Properties to view its metadata.
    </div>
  );
}
```

- [ ] **Step 3: Register the tab in the drawer shell**

Replace the full contents of `src/components/info-drawer/info-drawer.tsx` with (this also replaces the duplicated header/tab-strip ternaries with a single tab-metadata map):

```tsx
"use client";

import { useEffect } from "react";
import {
  X,
  Activity,
  MessageSquare,
  History,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useInfoDrawerStore,
  type InfoDrawerTab,
} from "@/lib/stores/info-drawer-store";
import { ActivityTab } from "./activity-tab";
import { NotesTab } from "./notes-tab";
import { VersionsTab } from "./versions-tab";
import { PropertiesTab } from "./properties-tab";

const TAB_META: Record<InfoDrawerTab, { label: string; icon: LucideIcon }> = {
  activity: { label: "Activity", icon: Activity },
  notes: { label: "Notes", icon: MessageSquare },
  versions: { label: "Versions", icon: History },
  properties: { label: "Properties", icon: SlidersHorizontal },
};

const TAB_ORDER: InfoDrawerTab[] = [
  "activity",
  "notes",
  "versions",
  "properties",
];

export function InfoDrawer() {
  const { isOpen, scope, activeTab, setActiveTab, close } = useInfoDrawerStore();

  const hasScope = !!scope?.connectionId && !!scope?.bucket;
  const scopeLabel = scope?.bucket
    ? scope.objectKey
      ? `${scope.bucket} / ${scope.objectKey}`
      : scope.prefix
      ? `${scope.bucket} / ${scope.prefix}`
      : scope.bucket
    : undefined;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  const ActiveIcon = TAB_META[activeTab].icon;

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
        aria-label="Info drawer"
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
              <ActiveIcon className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{TAB_META[activeTab].label}</h2>
            </div>
            {scopeLabel && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[260px]">
                {scopeLabel}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={close}
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Tab strip */}
        <div className="flex border-b border-border shrink-0">
          {TAB_ORDER.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 text-xs font-medium py-2 border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_META[tab].label}
            </button>
          ))}
        </div>

        {/* Body */}
        {!hasScope ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              Open a bucket to see {activeTab}
            </p>
          </div>
        ) : activeTab === "activity" ? (
          <ActivityTab />
        ) : activeTab === "notes" ? (
          <NotesTab />
        ) : activeTab === "versions" ? (
          <VersionsTab />
        ) : (
          <PropertiesTab />
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/info-drawer-store.ts src/components/info-drawer/info-drawer.tsx src/components/info-drawer/properties-tab.tsx
git commit -m "feat(info-drawer): register properties tab"
```

---

### Task 7: Properties tab UI (view + edit form)

**Files:**
- Modify: `src/components/info-drawer/properties-tab.tsx` (replace the Task 6 stub)

Form state is initialized from the head response; the form component is keyed by `objectKey + etag` so it re-mounts (and resets) when the object or its content changes. Read-only mode for non-ADMIN roles. Native `<select>` follows the house pattern (see `share-dialog.tsx`, `activity-tab.tsx`).

- [ ] **Step 1: Implement the tab**

Replace the full contents of `src/components/info-drawer/properties-tab.tsx` with:

```tsx
"use client";

import { useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useInfoDrawerStore } from "@/lib/stores/info-drawer-store";
import { useObjectHead, useUpdateObjectMetadata } from "@/lib/queries/objects";
import { useConnections } from "@/lib/queries/connections";
import { useBucketVersioning } from "@/lib/queries/buckets";
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

export function PropertiesTab() {
  const { scope } = useInfoDrawerStore();
  const connectionId = scope?.connectionId ?? "";
  const bucket = scope?.bucket ?? "";
  const objectKey = scope?.objectKey ?? "";

  const head = useObjectHead(connectionId, bucket, objectKey);
  const { data: connections = [] } = useConnections();
  const connection = connections.find((c) => c.id === connectionId);
  const canWrite = connection ? connection.role === "ADMIN" : true;

  if (!objectKey) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select a file and choose Properties to view its metadata.
      </div>
    );
  }

  if (head.isLoading) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Loading properties…
      </div>
    );
  }

  if (head.isError || !head.data) {
    return (
      <div className="p-4 text-xs text-destructive">
        {head.error instanceof Error
          ? head.error.message
          : "Failed to load properties"}
      </div>
    );
  }

  return (
    <PropertiesForm
      key={`${objectKey}:${head.data.etag ?? ""}`}
      connectionId={connectionId}
      bucket={bucket}
      objectKey={objectKey}
      properties={head.data}
      canWrite={canWrite}
    />
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

- [ ] **Step 2: Verify it compiles**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/info-drawer/properties-tab.tsx
git commit -m "feat(info-drawer): implement object properties view and edit form"
```

---

### Task 8: Entry point in file row + scope-clobber fix

**Files:**
- Modify: `src/components/browser/file-row.tsx` (menu item)
- Modify: `src/components/browser/file-browser.tsx:89-96` (scope sync effect)

Without the second change, opening the drawer triggers `file-browser`'s scope-sync effect, which overwrites the scope with `{connectionId, bucket, prefix}` and wipes `objectKey` — the Properties tab would instantly lose its object.

- [ ] **Step 1: Add the "Properties" menu item to file rows**

In `src/components/browser/file-row.tsx`:

Add `SlidersHorizontal` to the lucide imports (the block importing `Folder, File, ...`):

```ts
  History,
  SlidersHorizontal,
} from "lucide-react";
```

Add the store import next to the other store imports (after the `useVersionHistoryDialogStore` import on line 30):

```ts
import { useInfoDrawerStore } from "@/lib/stores/info-drawer-store";
```

Inside the `FileRow` component body, next to the other store hooks (after `const openVersionDialog = ...` on line 118):

```ts
  const setInfoScope = useInfoDrawerStore((s) => s.setScope);
  const openInfoDrawer = useInfoDrawerStore((s) => s.open);

  const handleOpenProperties = () => {
    setInfoScope({
      connectionId,
      bucket,
      prefix: currentPath || undefined,
      objectKey: object.key,
    });
    openInfoDrawer("properties");
  };
```

In the dropdown menu content, after the Share menu item (the `{!object.isFolder && (...Share...)}` block ending around line 258), add:

```tsx
              {!object.isFolder && (
                <DropdownMenuItem onClick={handleOpenProperties}>
                  <SlidersHorizontal className="h-4 w-4" />
                  Properties
                </DropdownMenuItem>
              )}
```

- [ ] **Step 2: Fix the scope-sync effect**

In `src/components/browser/file-browser.tsx`, replace the effect at lines 89-96:

```tsx
  useEffect(() => {
    if (!isInfoOpen) return;
    setInfoScope({
      connectionId,
      bucket,
      prefix: currentPath || undefined,
    });
  }, [isInfoOpen, connectionId, bucket, currentPath, setInfoScope]);
```

with a version that keeps an object scope alive as long as it still belongs to the current view (navigating away or switching bucket/connection clears it):

```tsx
  useEffect(() => {
    if (!isInfoOpen) return;
    const prev = useInfoDrawerStore.getState().scope;
    const prevObjectKey =
      prev && prev.connectionId === connectionId && prev.bucket === bucket
        ? prev.objectKey
        : undefined;
    setInfoScope({
      connectionId,
      bucket,
      prefix: currentPath || undefined,
      objectKey: prevObjectKey?.startsWith(currentPath)
        ? prevObjectKey
        : undefined,
    });
  }, [isInfoOpen, connectionId, bucket, currentPath, setInfoScope]);
```

(`useInfoDrawerStore` is already imported in this file at line 77's destructuring — the import statement itself already exists near the top.)

- [ ] **Step 3: Verify it compiles**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Manually verify the flow**

Run: `pnpm dev`, open a bucket, then:
1. Row menu → Properties → drawer opens on Properties tab showing that file's metadata; header shows `bucket / key`.
2. Edit Content-Type, add a metadata row, Save → toast "Properties saved"; reopen → values persisted.
3. Switch to Activity tab → the "updated properties of" event appears.
4. Navigate to another folder with the drawer open → Properties tab returns to its "Select a file…" hint (object scope cleared).
5. As a non-ADMIN member (if available): fields render disabled, no Save button.

- [ ] **Step 5: Commit**

```bash
git add src/components/browser/file-row.tsx src/components/browser/file-browser.tsx
git commit -m "feat(browser): open object properties from file row menu"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run the full check suite**

```bash
pnpm lint && pnpm test && pnpm build
```

Expected: lint clean, all vitest tests pass, production build succeeds.

- [ ] **Step 2: Commit any stragglers and review the diff**

```bash
git status
git log --oneline main..HEAD
```

Expected: working tree clean; one commit per task above on `feat/object-properties-panel`.
