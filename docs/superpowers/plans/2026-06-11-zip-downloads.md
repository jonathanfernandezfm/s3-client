# Multi-Select / Folder Download as Zip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users download a folder, or any multi-selection of files/folders, as a single zip file streamed from the server.

**Architecture:** A new authenticated route `POST /api/objects/download-zip` expands folder prefixes via `ListObjectsV2`, then streams a zip built with `archiver` (store mode, no compression) directly to the browser — objects are fetched from S3 one at a time and piped through, so memory stays flat regardless of total size. The client triggers the download with a hidden form POST targeting a hidden iframe, so the browser's native download manager handles the stream (no blob buffering, no bucket CORS requirements — which is why we stream server-side instead of using the existing `presign-batch` route: presigned URLs can't be zipped client-side without per-bucket CORS config, and wouldn't produce a single file otherwise). UI entry points: a "Download as zip" item on folder rows, and a "Download" button on the existing multi-select `BulkOpsPanel` (which becomes visible to read-only viewers for download purposes).

**Tech Stack:** Next.js 16 App Router route handlers (Node runtime), `archiver` for zip streaming, AWS SDK v3 (`ListObjectsV2Command`, `GetObjectCommand`), Vitest for unit tests.

---

## Codebase context (read this first)

- **Auth wrapper:** every objects API route uses `withAuth` from `@/lib/auth` (implemented in `src/lib/auth/protect.ts`). It injects `{ user }` and the handler returns a `NextResponse`. Access check pattern (copy from `src/app/api/objects/presign-batch/route.ts`):
  ```ts
  const access = await getConnectionAccessById(connectionId, user.id);
  if (!access) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  const client = createS3Client(access.connection);
  ```
  Downloads are allowed for any role that has access (same as the existing single-file download route) — no ADMIN check.
- **Folder convention:** folder keys always end with `/`. Buckets may contain zero-byte "folder marker" objects whose key ends with `/` — these must be skipped when zipping (see `moveFolder` in `src/app/api/objects/move/route.ts` for the recursive listing pattern with `ContinuationToken`).
- **Selection state:** `useBrowserStore().getPaneState(paneId).selectedItems` is a `Set<string>` of object keys. Selected objects always live in the browser's current folder, whose prefix is `currentPath` (e.g. `"photos/2024/"`, or `""` at bucket root).
- **Notifications:** `useNotificationStore().addNotification({ type, title, description?, status })`. Type `"download"` and statuses `"completed"`/`"error"` already exist (`src/lib/stores/notification-store.ts:3`).
- **Capability gating:** download UI is wrapped in `<CapabilityGate connectionId bucket capability="download-objects">` (see `src/components/browser/file-row.tsx:239`).
- **Tests:** Vitest, run with `pnpm test` (runs `vitest run`). Unit tests live next to source (`src/lib/versions/permissions.test.ts`, `src/lib/search/crawl/walk.test.ts`). S3 clients are faked as `{ send: vi.fn() }` cast to `S3Client`.
- **Concurrent sessions warning:** other Claude/dev sessions share this checkout and may move HEAD. Verify the branch (`git branch --show-current`) before every commit.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/zip/zip-naming.ts` (create) | Pure helpers: zip entry names, suggested zip filename, filename sanitization |
| `src/lib/zip/zip-naming.test.ts` (create) | Unit tests for the above |
| `src/lib/zip/collect-entries.ts` (create) | Expand selected keys (files + folder prefixes) into a flat, capped, deduped list of zip entries via `ListObjectsV2` |
| `src/lib/zip/collect-entries.test.ts` (create) | Unit tests with a fake S3 client |
| `src/lib/zip/trigger-zip-download.ts` (create) | Client-side: hidden form POST + hidden iframe to start the browser download |
| `src/lib/zip/trigger-zip-download.test.ts` (create) | jsdom unit test for the form helper |
| `src/app/api/objects/download-zip/route.ts` (create) | Authenticated streaming zip route |
| `src/components/browser/file-browser.tsx` (modify ~line 393) | Branch `handleDownload`: folder key → zip download, file key → existing presign flow |
| `src/components/browser/file-row.tsx` (modify ~line 238) | Show "Download as zip" menu item for folders |
| `src/components/browser/bulk-ops-panel.tsx` (modify) | Add "Download" button; make panel visible to read-only viewers (write actions stay gated) |

---

### Task 0: Branch setup

- [ ] **Step 1: Verify state and create a feature branch**

```bash
git branch --show-current
git status
git checkout main && git pull
git checkout -b feat/zip-downloads
```

Expected: new branch `feat/zip-downloads` off up-to-date `main`. If `git status` shows unrelated dirty files, leave them alone — do not commit them in later tasks (stage files explicitly, never `git add -A`).

### Task 1: Install archiver

**Files:**
- Modify: `package.json` (via pnpm)

- [ ] **Step 1: Add dependencies**

```bash
pnpm add archiver
pnpm add -D @types/archiver
```

Expected: `archiver` appears in `dependencies`, `@types/archiver` in `devDependencies`.

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add archiver for streaming zip downloads"
```

### Task 2: Zip naming helpers (pure functions)

**Files:**
- Create: `src/lib/zip/zip-naming.ts`
- Test: `src/lib/zip/zip-naming.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/zip/zip-naming.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  zipEntryName,
  zipDownloadName,
  sanitizeZipFilename,
} from "./zip-naming";

describe("zipEntryName", () => {
  it("strips the root prefix so the zip mirrors the visible folder", () => {
    expect(zipEntryName("photos/2024/cat.jpg", "photos/")).toBe("2024/cat.jpg");
  });

  it("keeps the full key when there is no root prefix (bucket root)", () => {
    expect(zipEntryName("cat.jpg", "")).toBe("cat.jpg");
  });

  it("falls back to the full key when it does not start with the prefix", () => {
    expect(zipEntryName("other/cat.jpg", "photos/")).toBe("other/cat.jpg");
  });

  it("never returns a leading slash", () => {
    expect(zipEntryName("/weird/key.txt", "")).toBe("weird/key.txt");
  });
});

describe("zipDownloadName", () => {
  it("names the zip after the folder when a single folder is selected", () => {
    expect(zipDownloadName(["photos/2024/"], "my-bucket", "photos/")).toBe(
      "2024.zip"
    );
  });

  it("names the zip after the current folder for multi-selections", () => {
    expect(
      zipDownloadName(["photos/a.jpg", "photos/b.jpg"], "my-bucket", "photos/")
    ).toBe("photos.zip");
  });

  it("falls back to the bucket name at bucket root", () => {
    expect(zipDownloadName(["a.jpg", "b.jpg"], "my-bucket", "")).toBe(
      "my-bucket.zip"
    );
  });
});

describe("sanitizeZipFilename", () => {
  it("replaces characters that are invalid in filenames", () => {
    expect(sanitizeZipFilename('a/b\\c:d*e?f"g<h>i|j.zip')).toBe(
      "a_b_c_d_e_f_g_h_i_j.zip"
    );
  });

  it("appends .zip when missing", () => {
    expect(sanitizeZipFilename("photos")).toBe("photos.zip");
  });

  it("falls back to download.zip for empty input", () => {
    expect(sanitizeZipFilename("")).toBe("download.zip");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/lib/zip/zip-naming.test.ts
```

Expected: FAIL — `Cannot find module './zip-naming'` (or similar resolution error).

- [ ] **Step 3: Write the implementation**

Create `src/lib/zip/zip-naming.ts`:

```ts
function lastSegment(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? "";
}

/**
 * Entry name inside the zip: the object key relative to the folder the user
 * is looking at, so the archive mirrors the visible tree.
 */
export function zipEntryName(key: string, rootPrefix: string): string {
  const relative =
    rootPrefix && key.startsWith(rootPrefix)
      ? key.slice(rootPrefix.length)
      : key;
  return relative.replace(/^\/+/, "");
}

/**
 * Suggested zip filename: a lone folder is named after itself; any other
 * selection is named after the current folder, falling back to the bucket.
 */
export function zipDownloadName(
  keys: string[],
  bucket: string,
  currentPath: string
): string {
  if (keys.length === 1 && keys[0].endsWith("/")) {
    const folder = lastSegment(keys[0]);
    if (folder) return `${folder}.zip`;
  }
  return `${lastSegment(currentPath) || bucket}.zip`;
}

export function sanitizeZipFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  if (!cleaned) return "download.zip";
  return cleaned.toLowerCase().endsWith(".zip") ? cleaned : `${cleaned}.zip`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/zip/zip-naming.test.ts
```

Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/zip/zip-naming.ts src/lib/zip/zip-naming.test.ts
git commit -m "feat(zip): add zip naming helpers"
```

### Task 3: Entry collection (folder expansion, dedupe, cap)

**Files:**
- Create: `src/lib/zip/collect-entries.ts`
- Test: `src/lib/zip/collect-entries.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/zip/collect-entries.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { S3Client } from "@aws-sdk/client-s3";
import { collectZipEntries, ZipTooLargeError } from "./collect-entries";

function fakeClient(pages: Array<Record<string, unknown>>) {
  const send = vi.fn();
  for (const page of pages) send.mockResolvedValueOnce(page);
  return { client: { send } as unknown as S3Client, send };
}

describe("collectZipEntries", () => {
  it("passes plain file keys through without listing", async () => {
    const { client, send } = fakeClient([]);
    const entries = await collectZipEntries(
      client,
      "bucket",
      ["photos/a.jpg", "photos/b.jpg"],
      "photos/"
    );
    expect(send).not.toHaveBeenCalled();
    expect(entries).toEqual([
      { key: "photos/a.jpg", name: "a.jpg" },
      { key: "photos/b.jpg", name: "b.jpg" },
    ]);
  });

  it("expands folder keys recursively, following pagination", async () => {
    const { client, send } = fakeClient([
      {
        Contents: [{ Key: "photos/2024/a.jpg" }],
        IsTruncated: true,
        NextContinuationToken: "token-1",
      },
      {
        Contents: [{ Key: "photos/2024/deep/b.jpg" }],
        IsTruncated: false,
      },
    ]);
    const entries = await collectZipEntries(
      client,
      "bucket",
      ["photos/2024/"],
      "photos/"
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].input).toMatchObject({
      Bucket: "bucket",
      Prefix: "photos/2024/",
      ContinuationToken: "token-1",
    });
    expect(entries).toEqual([
      { key: "photos/2024/a.jpg", name: "2024/a.jpg" },
      { key: "photos/2024/deep/b.jpg", name: "2024/deep/b.jpg" },
    ]);
  });

  it("skips zero-byte folder marker objects", async () => {
    const { client } = fakeClient([
      {
        Contents: [{ Key: "docs/" }, { Key: "docs/sub/" }, { Key: "docs/a.txt" }],
        IsTruncated: false,
      },
    ]);
    const entries = await collectZipEntries(client, "bucket", ["docs/"], "");
    expect(entries).toEqual([{ key: "docs/a.txt", name: "docs/a.txt" }]);
  });

  it("dedupes a file selected alongside its parent folder", async () => {
    const { client } = fakeClient([
      { Contents: [{ Key: "docs/a.txt" }], IsTruncated: false },
    ]);
    const entries = await collectZipEntries(
      client,
      "bucket",
      ["docs/a.txt", "docs/"],
      ""
    );
    expect(entries).toEqual([{ key: "docs/a.txt", name: "docs/a.txt" }]);
  });

  it("throws ZipTooLargeError beyond the entry cap", async () => {
    const { client } = fakeClient([
      {
        Contents: [{ Key: "d/1" }, { Key: "d/2" }, { Key: "d/3" }],
        IsTruncated: false,
      },
    ]);
    await expect(
      collectZipEntries(client, "bucket", ["d/"], "", 2)
    ).rejects.toBeInstanceOf(ZipTooLargeError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/lib/zip/collect-entries.test.ts
```

Expected: FAIL — cannot find module `./collect-entries`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/zip/collect-entries.ts`:

```ts
import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";
import { zipEntryName } from "./zip-naming";

export const MAX_ZIP_ENTRIES = 5000;

export interface ZipEntry {
  key: string;
  name: string;
}

export class ZipTooLargeError extends Error {
  constructor(max: number) {
    super(`Selection exceeds the ${max}-file zip limit`);
    this.name = "ZipTooLargeError";
  }
}

/**
 * Expand a selection of keys (files, and folders denoted by a trailing "/")
 * into a flat, deduped list of zip entries. Zero-byte folder marker objects
 * are skipped. Throws ZipTooLargeError past maxEntries.
 */
export async function collectZipEntries(
  client: S3Client,
  bucket: string,
  keys: string[],
  rootPrefix: string,
  maxEntries: number = MAX_ZIP_ENTRIES
): Promise<ZipEntry[]> {
  const seen = new Set<string>();
  const fileKeys: string[] = [];

  const addKey = (key: string) => {
    if (key.endsWith("/")) return; // folder markers carry no content
    if (seen.has(key)) return;
    seen.add(key);
    fileKeys.push(key);
    if (fileKeys.length > maxEntries) throw new ZipTooLargeError(maxEntries);
  };

  for (const key of keys) {
    if (!key.endsWith("/")) {
      addKey(key);
      continue;
    }

    let continuationToken: string | undefined;
    do {
      const page = (await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: key,
          ContinuationToken: continuationToken,
        })
      )) as ListObjectsV2CommandOutput;

      for (const obj of page.Contents ?? []) {
        if (obj.Key) addKey(obj.Key);
      }
      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }

  return fileKeys.map((key) => ({ key, name: zipEntryName(key, rootPrefix) }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/zip/collect-entries.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/zip/collect-entries.ts src/lib/zip/collect-entries.test.ts
git commit -m "feat(zip): expand selections into capped, deduped zip entry lists"
```

### Task 4: Streaming zip route

**Files:**
- Create: `src/app/api/objects/download-zip/route.ts`

No unit test for this route — `withAuth` requires a live Clerk session, matching the untested pattern of every other objects route. The logic-heavy parts (naming, expansion) are already unit-tested; the route is verified manually in Task 7.

- [ ] **Step 1: Write the route**

Create `src/app/api/objects/download-zip/route.ts`:

```ts
import { NextResponse } from "next/server";
import { PassThrough, Readable } from "stream";
import archiver, { type Archiver } from "archiver";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import {
  collectZipEntries,
  ZipTooLargeError,
  type ZipEntry,
} from "@/lib/zip/collect-entries";
import { sanitizeZipFilename } from "@/lib/zip/zip-naming";

export const runtime = "nodejs";

const MAX_SELECTED_KEYS = 1000;

interface ZipDownloadPayload {
  connectionId: string;
  bucket: string;
  keys: string[];
  rootPrefix?: string;
  filename?: string;
}

// Invoked via a hidden <form method="POST"> so the browser's download
// manager handles the streamed response; the JSON request lives in a
// form field rather than the body.
export const POST = withAuth(async (req, { user }) => {
  let payload: ZipDownloadPayload;
  try {
    const form = await req.formData();
    payload = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { connectionId, bucket, keys, rootPrefix = "", filename } = payload;
  if (
    !connectionId ||
    !bucket ||
    !Array.isArray(keys) ||
    keys.length === 0 ||
    keys.some((k) => typeof k !== "string" || k.length === 0)
  ) {
    return NextResponse.json(
      { error: "connectionId, bucket, and a non-empty keys array are required" },
      { status: 400 }
    );
  }
  if (keys.length > MAX_SELECTED_KEYS) {
    return NextResponse.json(
      { error: `At most ${MAX_SELECTED_KEYS} items can be zipped at once` },
      { status: 400 }
    );
  }

  const access = await getConnectionAccessById(connectionId, user.id);
  if (!access) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const client = createS3Client(access.connection);

  let entries: ZipEntry[];
  try {
    entries = await collectZipEntries(client, bucket, keys, rootPrefix);
  } catch (error) {
    if (error instanceof ZipTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { error: "Nothing to download — the selection contains no files" },
      { status: 400 }
    );
  }

  // store: true — most object data is already compressed; skip zlib CPU cost.
  const archive = archiver("zip", { store: true });
  const passthrough = new PassThrough();
  archive.on("warning", (err) => console.warn("[download-zip] warning:", err));
  archive.pipe(passthrough);

  void (async () => {
    for (const entry of entries) {
      const object = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: entry.key })
      );
      if (!object.Body) continue;
      await appendEntry(archive, object.Body as Readable, entry.name);
    }
    await archive.finalize();
  })().catch((error) => {
    // Mid-stream failure: kill the stream so the browser reports a failed
    // download instead of silently saving a truncated archive.
    console.error("[download-zip] aborted:", error);
    archive.abort();
    passthrough.destroy(error instanceof Error ? error : new Error(String(error)));
  });

  const safeName = sanitizeZipFilename(filename ?? "download.zip");
  return new NextResponse(
    Readable.toWeb(passthrough) as unknown as ReadableStream,
    {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        "Cache-Control": "no-store",
      },
    }
  );
});

// Appending entries one at a time (waiting for archiver's "entry" event)
// keeps a single S3 GET open at once — queueing them all up front would
// open every connection immediately and let S3 idle-time-out the tail.
function appendEntry(
  archive: Archiver,
  body: Readable,
  name: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEntry = () => {
      cleanup();
      resolve();
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      archive.off("entry", onEntry);
      archive.off("error", onError);
    };
    archive.once("entry", onEntry);
    archive.once("error", onError);
    archive.append(body, { name });
  });
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
pnpm lint
npx tsc --noEmit
```

Expected: no errors in the new file (pre-existing errors elsewhere, if any, are out of scope).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/objects/download-zip/route.ts
git commit -m "feat(zip): add streaming zip download route"
```

### Task 5: Client-side download trigger

**Files:**
- Create: `src/lib/zip/trigger-zip-download.ts`
- Test: `src/lib/zip/trigger-zip-download.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/zip/trigger-zip-download.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { triggerZipDownload } from "./trigger-zip-download";

describe("triggerZipDownload", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("submits a hidden form POST with the JSON payload", () => {
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(function (this: HTMLFormElement) {
        // capture form state at submit time, before the form is removed
        expect(this.method).toBe("post");
        expect(this.action).toContain("/api/objects/download-zip");
        expect(this.target).toBe("zip-download-frame");
        const input = this.querySelector(
          "input[name=payload]"
        ) as HTMLInputElement;
        expect(JSON.parse(input.value)).toEqual({
          connectionId: "conn-1",
          bucket: "bucket",
          keys: ["photos/2024/"],
          rootPrefix: "photos/",
          filename: "2024.zip",
        });
      });

    triggerZipDownload({
      connectionId: "conn-1",
      bucket: "bucket",
      keys: ["photos/2024/"],
      rootPrefix: "photos/",
      filename: "2024.zip",
    });

    expect(submit).toHaveBeenCalledTimes(1);
    // form is cleaned up, iframe persists for the response
    expect(document.querySelector("form")).toBeNull();
    expect(document.getElementById("zip-download-frame")).not.toBeNull();
  });

  it("reuses the hidden iframe across calls", () => {
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    const request = {
      connectionId: "c",
      bucket: "b",
      keys: ["a.txt"],
      rootPrefix: "",
      filename: "b.zip",
    };
    triggerZipDownload(request);
    triggerZipDownload(request);
    expect(document.querySelectorAll("iframe").length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/lib/zip/trigger-zip-download.test.ts
```

Expected: FAIL — cannot find module `./trigger-zip-download`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/zip/trigger-zip-download.ts`:

```ts
export interface ZipDownloadRequest {
  connectionId: string;
  bucket: string;
  keys: string[];
  rootPrefix: string;
  filename: string;
}

const IFRAME_ID = "zip-download-frame";

/**
 * Starts a zip download via a hidden form POST into a hidden iframe.
 * The browser's download manager streams the response natively — no blob
 * buffering — and a successful attachment response never navigates the page.
 */
export function triggerZipDownload(request: ZipDownloadRequest): void {
  let iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = IFRAME_ID;
    iframe.name = IFRAME_ID;
    iframe.style.display = "none";
    document.body.appendChild(iframe);
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/objects/download-zip";
  form.target = IFRAME_ID;
  form.style.display = "none";

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "payload";
  input.value = JSON.stringify(request);
  form.appendChild(input);

  document.body.appendChild(form);
  form.submit();
  form.remove();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/lib/zip/trigger-zip-download.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/zip/trigger-zip-download.ts src/lib/zip/trigger-zip-download.test.ts
git commit -m "feat(zip): add client-side zip download trigger"
```

### Task 6: UI wiring — folder download + bulk download button

**Files:**
- Modify: `src/components/browser/file-browser.tsx` (handleDownload ~line 393, BulkOpsPanel usage ~line 619)
- Modify: `src/components/browser/file-row.tsx` (~line 238)
- Modify: `src/components/browser/bulk-ops-panel.tsx`

- [ ] **Step 1: Branch `handleDownload` for folders in `file-browser.tsx`**

Add imports at the top of `src/components/browser/file-browser.tsx`:

```ts
import { triggerZipDownload } from "@/lib/zip/trigger-zip-download";
import { zipDownloadName } from "@/lib/zip/zip-naming";
```

Replace the body of `handleDownload` (currently `const handleDownload = async (key: string) => { try { const response = await fetch("/api/objects/download", ...` at ~line 393) with:

```ts
  const handleDownload = async (key: string) => {
    if (key.endsWith("/")) {
      triggerZipDownload({
        connectionId,
        bucket,
        keys: [key],
        rootPrefix: currentPath,
        filename: zipDownloadName([key], bucket, currentPath),
      });
      addNotification({
        type: "download",
        title: "Zip download started",
        description: "Check your browser downloads for progress",
        status: "completed",
      });
      return;
    }

    try {
      const response = await fetch("/api/objects/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          bucket,
          key,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get download URL");
      }

      const { url } = await response.json();
      window.open(url, "_blank");
    } catch (error) {
      addNotification({
        type: "download",
        title: "Download failed",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      });
    }
  };
```

(The single-file branch is the existing code, unchanged.)

- [ ] **Step 2: Show a download item for folders in `file-row.tsx`**

In `src/components/browser/file-row.tsx`, the dropdown currently renders Download only for files (~line 238):

```tsx
              {!object.isFolder && (
                <CapabilityGate connectionId={connectionId} bucket={bucket} capability="download-objects" disableOnly>
                  <DropdownMenuItem onClick={onDownload}>
                    <Download className="h-4 w-4" />
                    Download
                  </DropdownMenuItem>
                </CapabilityGate>
              )}
```

Replace that block with one that renders for both, labeling folders explicitly:

```tsx
              <CapabilityGate connectionId={connectionId} bucket={bucket} capability="download-objects" disableOnly>
                <DropdownMenuItem onClick={onDownload}>
                  <Download className="h-4 w-4" />
                  {object.isFolder ? "Download as zip" : "Download"}
                </DropdownMenuItem>
              </CapabilityGate>
```

No prop changes needed: `FileList` already wires `onDownload={() => onDownload(object.key)}` for every row (`src/components/browser/file-list.tsx:213`), and folder keys end with `/`, which `handleDownload` now branches on.

- [ ] **Step 3: Add Download to `bulk-ops-panel.tsx` and open the panel to viewers**

In `src/components/browser/bulk-ops-panel.tsx`:

3a. Add imports:

```ts
import { triggerZipDownload } from "@/lib/zip/trigger-zip-download";
import { zipDownloadName } from "@/lib/zip/zip-naming";
```

and add `Download` to the existing `lucide-react` import list.

3b. Add `currentPath` to the props interface:

```ts
interface BulkOpsPanelProps {
  paneId: string;
  connectionId: string;
  bucket: string;
  currentPath: string;
  objects: S3Object[];
  canWrite: boolean;
}
```

and destructure it in the component signature alongside the others.

3c. Make the panel visible to read-only viewers. Replace:

```ts
  const showIdle =
    canWrite && !showProgress && !dialogOpen && selectedItems.size >= 2;
```

with:

```ts
  const showIdle = !showProgress && !dialogOpen && selectedItems.size >= 2;
```

3d. Keep write actions writer-only. Wrap the Rename button, the Tag `CapabilityGate`, the Share `FeatureGate`, and the Delete `CapabilityGate` (the four action blocks inside the `showIdle` toolbar) in `{canWrite && ( ... )}`. Example for Rename:

```tsx
          {canWrite && (
            <Button size="sm" variant="ghost" onClick={() => openDialog("rename", paneId)}>
              <Pencil className="h-4 w-4" />
              Rename
            </Button>
          )}
```

Apply the same `{canWrite && (...)}` wrapper to the Tag, Share, and Delete blocks (keep their existing inner contents untouched).

3e. Add the download handler inside the component (next to `shareAll`):

```ts
  function downloadSelectionAsZip() {
    const keys = selection.map((o) => o.key);
    if (keys.length === 0) return;
    triggerZipDownload({
      connectionId,
      bucket,
      keys,
      rootPrefix: currentPath,
      filename: zipDownloadName(keys, bucket, currentPath),
    });
    addNotification({
      type: "download",
      title: "Zip download started",
      description: `Zipping ${keys.length} item${keys.length !== 1 ? "s" : ""} — check your browser downloads`,
      status: "completed",
    });
    clearSelection(paneId);
  }
```

3f. Add the button as the first action in the toolbar, immediately after the `<div className="h-5 w-px bg-border" />` divider that follows the "N selected" label:

```tsx
          <CapabilityGate connectionId={connectionId} bucket={bucket} capability="download-objects">
            <Button size="sm" variant="ghost" onClick={downloadSelectionAsZip}>
              <Download className="h-4 w-4" />
              Download
            </Button>
          </CapabilityGate>
```

- [ ] **Step 4: Pass `currentPath` from `file-browser.tsx`**

In `src/components/browser/file-browser.tsx` (~line 619), update the `BulkOpsPanel` usage:

```tsx
      <BulkOpsPanel
        paneId={paneId}
        connectionId={connectionId}
        bucket={bucket}
        currentPath={currentPath}
        objects={data?.objects || []}
        canWrite={canWrite}
      />
```

- [ ] **Step 5: Verify lint and types**

```bash
pnpm lint
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/browser/file-browser.tsx src/components/browser/file-row.tsx src/components/browser/bulk-ops-panel.tsx
git commit -m "feat(zip): folder and multi-select download-as-zip UI"
```

### Task 7: End-to-end verification

**Files:** none (manual verification)

- [ ] **Step 1: Full automated checks**

```bash
pnpm test
pnpm lint
pnpm build
```

Expected: all pass.

- [ ] **Step 2: Manual verification against a real bucket**

Start the dev server (`pnpm dev`), sign in, open a connection/bucket with nested folders, then verify:

1. **Folder download:** open a folder row's `⋮` menu → "Download as zip" → browser downloads `<folder>.zip`; extract it and confirm the internal paths mirror the folder tree (entries relative to the current path, folder name as the top-level directory).
2. **Multi-select download:** select 2+ items (mix of files and a folder) → bulk panel shows Download → click → single zip arrives containing all files, folder contents recursed.
3. **Empty folder:** download a folder containing only a folder marker → no download starts (route returns 400 into the hidden iframe); page stays functional.
4. **Large-ish folder:** download a folder with enough content that streaming matters (>100 MB if available) → download streams progressively in the browser's download manager; dev-server memory stays flat.
5. **Gallery view:** switch to grid view, select multiple tiles → bulk panel Download works the same.
6. **Viewer role (if a viewer-role connection is available):** multi-select shows the panel with only the Download button; rename/tag/share/delete are absent.

Known accepted limitation (document in PR description): because the response streams into a hidden iframe, server-side errors that occur *before* streaming starts (e.g. entry-cap exceeded) fail silently — the iframe swallows the JSON error. Mid-stream failures surface as a failed download in the browser's download manager.

- [ ] **Step 3: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to decide merge/PR/cleanup.

---

## Self-review notes

- **Spec coverage:** multi-select download → Task 6 (bulk panel); folder download → Tasks 3/4/6 (recursive expansion + row menu); "stream server-side" option chosen over batch presigned URLs — rationale in the Architecture section (single-file deliverable, no per-bucket CORS, flat memory).
- **Why not reuse `presign-batch`:** it returns URLs the browser would have to fetch cross-origin and zip client-side; that requires CORS on every bucket and buffers everything in browser memory. It remains in place for previews.
- **Type consistency:** `ZipEntry { key, name }` defined in Task 3, consumed in Task 4; `ZipDownloadRequest` defined in Task 5, satisfied by call sites in Task 6; `zipDownloadName(keys, bucket, currentPath)` signature consistent across Tasks 2, 5 (test payload), and 6.
- **No DOWNLOAD activity recording:** the existing single-file download route records no activity and the `ActivityAction` enum has no `DOWNLOAD` member — adding one is a schema migration outside this feature's scope.
