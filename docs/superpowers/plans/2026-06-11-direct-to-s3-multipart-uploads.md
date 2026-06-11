# Direct-to-S3 Uploads (Presigned Multipart) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the server-buffered upload path with direct-to-S3 presigned uploads (single PUT for small files, multipart for large), with parallel part upload, pause/resume, cancel, folder upload (drag-drop and picker), and a visible upload manager panel.

**Architecture:** The browser asks new API routes to create an upload (`create` returns either a presigned PUT URL or a multipart `uploadId` + part size), presign part URLs in batches (`sign-parts`), and finalize (`complete`, which also does activity/index/usage bookkeeping using a `HeadObject` for the authoritative size). Bytes flow browser → S3 directly via XHR (for progress events); the Next.js server only signs and finalizes. A client-side upload engine (`src/lib/uploads/`) orchestrates parts with retries and an abortable worker pool; a rewritten Zustand `upload-store` plus a `controller` module manage the queue (max 3 concurrent files) and expose pause/resume/cancel; a new floating Upload Manager panel renders progress. Cancel/abort reuses the existing `DELETE /api/buckets/[bucket]/multipart-uploads` endpoint, and orphaned multipart uploads remain visible in the existing incomplete-uploads tab.

**Tech Stack:** Next.js 16 App Router API routes, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, Zustand, TanStack React Query, XMLHttpRequest (upload progress), Vitest.

**Out of scope (explicitly):**
- Resume across page reload (browser `File` handles cannot be persisted). Pause/resume is in-session only. Orphaned multipart uploads are visible in the existing "Incomplete uploads" tab (`src/components/buckets/multipart-uploads-tab.tsx`) where they can be aborted.
- Folder *structure* upload on browsers without `webkitGetAsEntry` (falls back to flat file list).
- Checksums/integrity verification beyond S3's own ETag handling.

**Key existing code facts (verified):**
- `withAuth` wrapper: `src/lib/auth/protect.ts` — handler receives `(req, { user, params })`, `user.subscription?.tier`.
- `getConnectionAccessById(connectionId, userId)` from `@/lib/db/connections` returns `{ connection, role, workspaceId, ... } | null`; ADMIN role required for writes.
- `canUploadFileSize(bytes, tier)` and `recordUpload(userId, bytes)` from `@/lib/subscriptions`.
- `recordActivity` from `@/lib/db/activity` (action `"UPLOAD"`, `byteSize: BigInt`).
- `indexUpsert` from `@/lib/search/index-ops` takes `{ workspaceId, connectionId, bucket, key, size: BigInt, lastModified: Date, etag: string | null }`.
- Abort endpoint already exists: `DELETE /api/buckets/[bucket]/multipart-uploads` with body `{ connectionId, uploads: [{ key, uploadId }] }` (ADMIN-checked, records `MULTIPART_ABORT` activity, treats `NoSuchUpload` as success).
- `src/lib/stores/upload-store.ts` is currently **dead code** (zero imports outside itself) — safe to rewrite from scratch.
- Notifications panel is `fixed bottom-4 right-4 z-50 w-96` — the new upload panel goes bottom-LEFT to avoid overlap.
- `formatBytes` exists in `src/lib/utils.ts`. `Progress` UI primitive exists at `src/components/ui/progress.tsx` (shadcn-style, `value` is 0–100).
- Tests: Vitest, `environment: "node"` (File/Blob/DOMException are Node 18+ globals — fine), run with `pnpm vitest run <path>` or `pnpm test` for all. Codebase convention: pure helpers get unit tests; API routes and React components are not unit-tested — keep routes thin and push logic into tested helpers.
- Old `POST /api/objects/upload` route is called ONLY from `src/components/browser/upload-zone.tsx` (2 call sites) — deletable once UI is rewired.
- FREE tier `maxUploadSizeMB` is 50; PRO/ENTERPRISE unlimited (`-1`). The tier check carries over unchanged at `create` time.

## File Structure

```
Create:
  src/lib/uploads/types.ts              # shared upload types (UploadTarget, CreateUploadResponse, CompletedPart)
  src/lib/uploads/part-math.ts          # part size/count math + single-PUT threshold (pure, tested)
  src/lib/uploads/part-math.test.ts
  src/lib/uploads/validate.ts           # part-number request validation (pure, tested)
  src/lib/uploads/validate.test.ts
  src/lib/uploads/api.ts                # fetch wrappers for the new endpoints + abort reuse
  src/lib/uploads/transport.ts          # XHR PUT with progress + abort (browser-only, thin)
  src/lib/uploads/uploader.ts           # FileUploader orchestrator (injected deps, tested)
  src/lib/uploads/uploader.test.ts
  src/lib/uploads/controller.ts         # queue pump + uploader registry (injected factory, tested)
  src/lib/uploads/controller.test.ts
  src/lib/uploads/folder-walk.ts        # DataTransfer/webkit entry traversal (pure-ish, tested)
  src/lib/uploads/folder-walk.test.ts
  src/app/api/objects/multipart/create/route.ts
  src/app/api/objects/multipart/sign-parts/route.ts
  src/app/api/objects/multipart/complete/route.ts
  src/components/browser/upload-manager.tsx   # floating progress panel
  src/lib/stores/upload-store.test.ts
  docs/DIRECT_UPLOADS_CORS.md           # required bucket CORS configuration

Modify:
  src/lib/stores/upload-store.ts        # full rewrite (currently dead code)
  src/components/browser/upload-zone.tsx # rewrite to enqueue via controller; add folder support
  src/components/browser/file-browser.tsx # add UploadFolderButton (~line 506)
  src/app/app/layout.tsx                # mount <UploadManager />

Delete (final task):
  src/app/api/objects/upload/route.ts   # legacy server-buffered upload
```

---

### Task 1: Shared types + part math

**Files:**
- Create: `src/lib/uploads/types.ts`
- Create: `src/lib/uploads/part-math.ts`
- Test: `src/lib/uploads/part-math.test.ts`

- [ ] **Step 1: Create the shared types file**

```ts
// src/lib/uploads/types.ts
export interface UploadTarget {
  connectionId: string;
  bucket: string;
  key: string;
}

export type CreateUploadResponse =
  | { mode: "single"; url: string }
  | { mode: "multipart"; uploadId: string; partSize: number };

export interface CompletedPart {
  partNumber: number;
  etag: string;
}
```

- [ ] **Step 2: Write the failing tests for part math**

```ts
// src/lib/uploads/part-math.test.ts
import { describe, it, expect } from "vitest";
import {
  MIB,
  DEFAULT_PART_SIZE,
  SINGLE_PUT_THRESHOLD,
  MAX_PARTS,
  computePartSize,
  computePartCount,
  isSinglePutEligible,
} from "./part-math";

describe("computePartSize", () => {
  it("returns the default part size for typical files", () => {
    expect(computePartSize(0)).toBe(DEFAULT_PART_SIZE);
    expect(computePartSize(100 * MIB)).toBe(DEFAULT_PART_SIZE);
    expect(computePartSize(MAX_PARTS * DEFAULT_PART_SIZE)).toBe(DEFAULT_PART_SIZE);
  });

  it("scales up for files that would exceed the 10,000 part limit", () => {
    const fileSize = 100 * 1024 * MIB; // 100 GiB
    const partSize = computePartSize(fileSize);
    expect(partSize).toBeGreaterThan(DEFAULT_PART_SIZE);
    expect(partSize % MIB).toBe(0); // whole MiB
    expect(computePartCount(fileSize, partSize)).toBeLessThanOrEqual(MAX_PARTS);
  });
});

describe("computePartCount", () => {
  it("returns 1 for an empty file", () => {
    expect(computePartCount(0, DEFAULT_PART_SIZE)).toBe(1);
  });

  it("rounds up partial parts", () => {
    expect(computePartCount(8 * MIB, 8 * MIB)).toBe(1);
    expect(computePartCount(8 * MIB + 1, 8 * MIB)).toBe(2);
    expect(computePartCount(24 * MIB, 8 * MIB)).toBe(3);
  });
});

describe("isSinglePutEligible", () => {
  it("uses a single PUT up to and including the threshold", () => {
    expect(isSinglePutEligible(0)).toBe(true);
    expect(isSinglePutEligible(SINGLE_PUT_THRESHOLD)).toBe(true);
    expect(isSinglePutEligible(SINGLE_PUT_THRESHOLD + 1)).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/uploads/part-math.test.ts`
Expected: FAIL — `Cannot find module './part-math'` (or equivalent resolve error).

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/uploads/part-math.ts
export const MIB = 1024 * 1024;

/** S3 allows at most 10,000 parts per multipart upload. */
export const MAX_PARTS = 10_000;

/** Part size used unless the file is too large to fit in MAX_PARTS parts. */
export const DEFAULT_PART_SIZE = 8 * MIB;

/** Files at or below this size are uploaded with a single presigned PUT. */
export const SINGLE_PUT_THRESHOLD = 8 * MIB;

export function computePartSize(fileSize: number): number {
  if (fileSize <= MAX_PARTS * DEFAULT_PART_SIZE) return DEFAULT_PART_SIZE;
  // Scale up so the file fits in MAX_PARTS parts, rounded up to a whole MiB.
  return Math.ceil(fileSize / MAX_PARTS / MIB) * MIB;
}

export function computePartCount(fileSize: number, partSize: number): number {
  if (fileSize === 0) return 1;
  return Math.ceil(fileSize / partSize);
}

export function isSinglePutEligible(fileSize: number): boolean {
  return fileSize <= SINGLE_PUT_THRESHOLD;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/uploads/part-math.test.ts`
Expected: PASS (3 test groups, all green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/uploads/types.ts src/lib/uploads/part-math.ts src/lib/uploads/part-math.test.ts
git commit -m "feat(uploads): add shared upload types and part-size math"
```

---

### Task 2: Part-number request validation

**Files:**
- Create: `src/lib/uploads/validate.ts`
- Test: `src/lib/uploads/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/uploads/validate.test.ts
import { describe, it, expect } from "vitest";
import { validatePartNumbers, MAX_SIGN_BATCH } from "./validate";

describe("validatePartNumbers", () => {
  it("accepts a valid list of part numbers", () => {
    expect(validatePartNumbers([1, 2, 3])).toEqual([1, 2, 3]);
    expect(validatePartNumbers([10000])).toEqual([10000]);
  });

  it("rejects non-arrays and empty arrays", () => {
    expect(validatePartNumbers(undefined)).toBeNull();
    expect(validatePartNumbers("1,2")).toBeNull();
    expect(validatePartNumbers([])).toBeNull();
  });

  it("rejects batches larger than MAX_SIGN_BATCH", () => {
    const tooMany = Array.from({ length: MAX_SIGN_BATCH + 1 }, (_, i) => i + 1);
    expect(validatePartNumbers(tooMany)).toBeNull();
  });

  it("rejects out-of-range or non-integer values", () => {
    expect(validatePartNumbers([0])).toBeNull();
    expect(validatePartNumbers([10001])).toBeNull();
    expect(validatePartNumbers([1.5])).toBeNull();
    expect(validatePartNumbers(["2"])).toBeNull();
    expect(validatePartNumbers([1, -3])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/uploads/validate.test.ts`
Expected: FAIL — cannot find module `./validate`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/uploads/validate.ts
import { MAX_PARTS } from "./part-math";

/** Maximum number of part URLs signed per request. */
export const MAX_SIGN_BATCH = 100;

/**
 * Returns the validated part numbers, or null if the input is not a
 * non-empty array of integers in [1, MAX_PARTS] within the batch cap.
 */
export function validatePartNumbers(input: unknown): number[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_SIGN_BATCH) {
    return null;
  }
  const out: number[] = [];
  for (const n of input) {
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_PARTS) {
      return null;
    }
    out.push(n);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/uploads/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/uploads/validate.ts src/lib/uploads/validate.test.ts
git commit -m "feat(uploads): add part-number validation helper"
```

---

### Task 3: `create` endpoint

**Files:**
- Create: `src/app/api/objects/multipart/create/route.ts`

API routes in this codebase are thin and not unit-tested (the tested logic lives in the helpers from Tasks 1–2). Follow that convention.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/objects/multipart/create/route.ts
import { NextResponse } from "next/server";
import {
  CreateMultipartUploadCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { canUploadFileSize } from "@/lib/subscriptions";
import { computePartSize, isSinglePutEligible } from "@/lib/uploads/part-math";

const PRESIGN_EXPIRES_SECONDS = 3600;

type CreateRequest = {
  connectionId: string;
  bucket: string;
  key: string;
  fileSize: number;
  contentType?: string;
};

export const POST = withAuth(async (req, { user }) => {
  try {
    const { connectionId, bucket, key, fileSize, contentType }: CreateRequest =
      await req.json();

    if (
      !connectionId ||
      !bucket ||
      !key ||
      typeof fileSize !== "number" ||
      !Number.isFinite(fileSize) ||
      fileSize < 0
    ) {
      return NextResponse.json(
        { error: "connectionId, bucket, key, and fileSize are required" },
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
        { error: "You do not have permission to upload files for this connection" },
        { status: 403 }
      );
    }

    const tier = user.subscription?.tier ?? "FREE";
    const sizeCheck = canUploadFileSize(fileSize, tier);
    if (!sizeCheck.allowed) {
      return NextResponse.json({ error: sizeCheck.reason }, { status: 403 });
    }

    const client = createS3Client(access.connection);
    const resolvedContentType = contentType || "application/octet-stream";

    if (isSinglePutEligible(fileSize)) {
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: resolvedContentType,
        }),
        { expiresIn: PRESIGN_EXPIRES_SECONDS }
      );
      return NextResponse.json({ mode: "single", url });
    }

    const created = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: resolvedContentType,
      })
    );

    if (!created.UploadId) {
      return NextResponse.json(
        { error: "S3 did not return an upload ID" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      mode: "multipart",
      uploadId: created.UploadId,
      partSize: computePartSize(fileSize),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
```

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/objects/multipart/create/route.ts
git commit -m "feat(api): add multipart upload create endpoint with presigned single-PUT mode"
```

---

### Task 4: `sign-parts` endpoint

**Files:**
- Create: `src/app/api/objects/multipart/sign-parts/route.ts`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/objects/multipart/sign-parts/route.ts
import { NextResponse } from "next/server";
import { UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { validatePartNumbers, MAX_SIGN_BATCH } from "@/lib/uploads/validate";

const PRESIGN_EXPIRES_SECONDS = 3600;

type SignPartsRequest = {
  connectionId: string;
  bucket: string;
  key: string;
  uploadId: string;
  partNumbers: number[];
};

export const POST = withAuth(async (req, { user }) => {
  try {
    const { connectionId, bucket, key, uploadId, partNumbers }: SignPartsRequest =
      await req.json();

    if (!connectionId || !bucket || !key || !uploadId) {
      return NextResponse.json(
        { error: "connectionId, bucket, key, and uploadId are required" },
        { status: 400 }
      );
    }

    const validParts = validatePartNumbers(partNumbers);
    if (!validParts) {
      return NextResponse.json(
        {
          error: `partNumbers must be a non-empty array of integers between 1 and 10000 (max ${MAX_SIGN_BATCH} per request)`,
        },
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
        { error: "You do not have permission to upload files for this connection" },
        { status: 403 }
      );
    }

    const client = createS3Client(access.connection);

    const urls: Record<number, string> = {};
    await Promise.all(
      validParts.map(async (partNumber) => {
        urls[partNumber] = await getSignedUrl(
          client,
          new UploadPartCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
          }),
          { expiresIn: PRESIGN_EXPIRES_SECONDS }
        );
      })
    );

    return NextResponse.json({ urls });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
```

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/objects/multipart/sign-parts/route.ts
git commit -m "feat(api): add multipart sign-parts endpoint"
```

---

### Task 5: `complete` endpoint

**Files:**
- Create: `src/app/api/objects/multipart/complete/route.ts`

This endpoint finalizes both modes. For multipart it sends `CompleteMultipartUpload`; for single-PUT mode (`uploadId` absent) the object already exists. In both cases it reads the authoritative object size via `HeadObject` (the client uploaded directly to S3, so we never trust a client-supplied size for usage accounting), then records activity, search index, and usage — exactly the bookkeeping the legacy upload route did.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/objects/multipart/complete/route.ts
import { NextResponse } from "next/server";
import {
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { recordUpload } from "@/lib/subscriptions";
import { recordActivity } from "@/lib/db/activity";
import { indexUpsert } from "@/lib/search/index-ops";

type CompleteRequest = {
  connectionId: string;
  bucket: string;
  key: string;
  uploadId?: string;
  parts?: Array<{ partNumber: number; etag: string }>;
};

export const POST = withAuth(async (req, { user }) => {
  try {
    const { connectionId, bucket, key, uploadId, parts }: CompleteRequest =
      await req.json();

    if (!connectionId || !bucket || !key) {
      return NextResponse.json(
        { error: "connectionId, bucket, and key are required" },
        { status: 400 }
      );
    }
    if (
      uploadId &&
      (!Array.isArray(parts) ||
        parts.length === 0 ||
        parts.some(
          (p) =>
            !p ||
            typeof p.partNumber !== "number" ||
            !Number.isInteger(p.partNumber) ||
            typeof p.etag !== "string" ||
            p.etag.length === 0
        ))
    ) {
      return NextResponse.json(
        { error: "parts are required to complete a multipart upload" },
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
        { error: "You do not have permission to upload files for this connection" },
        { status: 403 }
      );
    }

    const client = createS3Client(access.connection);

    if (uploadId) {
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts!.map((p) => ({
              PartNumber: p.partNumber,
              ETag: p.etag,
            })),
          },
        })
      );
    }

    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );
    const size = BigInt(head.ContentLength ?? 0);

    await recordActivity({
      connectionId,
      userId: user.id,
      userDisplayName:
        [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      userImageUrl: user.imageUrl ?? null,
      action: "UPLOAD",
      bucket,
      key,
      byteSize: size,
    });

    await indexUpsert({
      workspaceId: access.workspaceId,
      connectionId,
      bucket,
      key,
      size,
      lastModified: head.LastModified ?? new Date(),
      etag: head.ETag ? head.ETag.replace(/"/g, "") : null,
    });

    await recordUpload(user.id, Number(size));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
```

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/objects/multipart/complete/route.ts
git commit -m "feat(api): add multipart complete endpoint with activity, index, and usage bookkeeping"
```

---

### Task 6: Client API wrappers + XHR transport

**Files:**
- Create: `src/lib/uploads/api.ts`
- Create: `src/lib/uploads/transport.ts`

These are thin browser-side adapters (fetch and XMLHttpRequest). They are not unit-tested — all orchestration logic that uses them is tested in Task 7 with fakes. `fetch` cannot report upload progress, hence XHR for the actual byte transfer.

Abort reuses the EXISTING endpoint `DELETE /api/buckets/[bucket]/multipart-uploads` (it already checks ADMIN, records `MULTIPART_ABORT` activity, and tolerates `NoSuchUpload`). No new abort route is needed.

- [ ] **Step 1: Write the API wrappers**

```ts
// src/lib/uploads/api.ts
import type { CompletedPart, CreateUploadResponse, UploadTarget } from "./types";

async function requestJson<T>(
  url: string,
  method: string,
  body: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function createUpload(
  params: UploadTarget & { fileSize: number; contentType: string }
): Promise<CreateUploadResponse> {
  return requestJson("/api/objects/multipart/create", "POST", params);
}

export function signParts(
  params: UploadTarget & { uploadId: string; partNumbers: number[] }
): Promise<{ urls: Record<number, string> }> {
  return requestJson("/api/objects/multipart/sign-parts", "POST", params);
}

export function completeUpload(
  params: UploadTarget & { uploadId?: string; parts?: CompletedPart[] }
): Promise<{ success: boolean }> {
  return requestJson("/api/objects/multipart/complete", "POST", params);
}

export async function abortUpload(
  params: UploadTarget & { uploadId: string }
): Promise<void> {
  await requestJson(
    `/api/buckets/${encodeURIComponent(params.bucket)}/multipart-uploads`,
    "DELETE",
    {
      connectionId: params.connectionId,
      uploads: [{ key: params.key, uploadId: params.uploadId }],
    }
  );
}
```

- [ ] **Step 2: Write the XHR transport**

```ts
// src/lib/uploads/transport.ts
export interface PutBlobOptions {
  contentType?: string;
  signal: AbortSignal;
  onProgress: (loadedBytes: number) => void;
}

export interface PutBlobResult {
  etag: string | null;
}

/**
 * PUT a blob to a presigned URL via XHR (fetch cannot report upload progress).
 * Rejects with DOMException("Aborted", "AbortError") when the signal aborts.
 */
export function putBlob(
  url: string,
  blob: Blob,
  opts: PutBlobOptions
): Promise<PutBlobResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (opts.contentType) {
      xhr.setRequestHeader("Content-Type", opts.contentType);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ etag: xhr.getResponseHeader("ETag") });
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Network error during upload. If this persists, check the bucket's CORS configuration — it must allow PUT from this origin and expose the ETag header (see docs/DIRECT_UPLOADS_CORS.md)."
        )
      );
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}
```

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/uploads/api.ts src/lib/uploads/transport.ts
git commit -m "feat(uploads): add client API wrappers and XHR transport with progress"
```

---

### Task 7: FileUploader orchestrator

**Files:**
- Create: `src/lib/uploads/uploader.ts`
- Test: `src/lib/uploads/uploader.test.ts`

The uploader receives its dependencies (createUpload/signParts/putBlob/completeUpload/abortUpload) by injection so all orchestration logic — concurrency pool, retries, pause/resume bookkeeping, ETag collection, ordering — is testable with fakes. The real deps are wired in Task 9's controller.

Behavior contract:
- `start()` begins, or resumes after a pause/error. Already-completed parts are never re-uploaded.
- `pause()` aborts in-flight part PUTs; completed parts (and the `uploadId`) are kept in memory for resume.
- `cancel()` aborts in-flight PUTs and best-effort aborts the remote multipart upload.
- Each part gets up to 3 attempts; a missing ETag (CORS misconfiguration) is a hard, descriptive error.
- Progress = sum of bytes for completed parts + in-flight loaded bytes, capped at file size.
- URLs are signed lazily in batches of 50 so multi-hour uploads don't outlive the 1-hour presign expiry.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/uploads/uploader.test.ts
import { describe, it, expect, vi } from "vitest";
import { FileUploader, type UploaderDeps } from "./uploader";
import type { UploadTarget } from "./types";

const target: UploadTarget = {
  connectionId: "conn-1",
  bucket: "bucket-1",
  key: "folder/test.bin",
};

function makeFile(size: number): File {
  return new File([new Uint8Array(size)], "test.bin", {
    type: "application/octet-stream",
  });
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type PendingPut = {
  url: string;
  blob: Blob;
  resolve: (etag: string | null) => void;
  reject: (err: unknown) => void;
};

/** putBlob fake whose resolution the test controls; rejects with AbortError on signal abort. */
function makeControlledPut() {
  const pending: PendingPut[] = [];
  const putBlob = vi.fn(
    (
      url: string,
      blob: Blob,
      opts: { signal: AbortSignal; onProgress: (n: number) => void }
    ) =>
      new Promise<{ etag: string | null }>((resolve, reject) => {
        opts.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true }
        );
        pending.push({
          url,
          blob,
          resolve: (etag) => resolve({ etag }),
          reject,
        });
      })
  );
  return { putBlob, pending };
}

function makeDeps(overrides: Partial<UploaderDeps> = {}): UploaderDeps {
  return {
    createUpload: vi.fn(async () => ({
      mode: "multipart" as const,
      uploadId: "up-1",
      partSize: 4,
    })),
    signParts: vi.fn(async (params: { partNumbers: number[] }) => ({
      urls: Object.fromEntries(
        params.partNumbers.map((n) => [n, `https://signed/${n}`])
      ),
    })),
    putBlob: vi.fn(async () => ({ etag: "etag-x" })),
    completeUpload: vi.fn(async () => ({ success: true })),
    abortUpload: vi.fn(async () => {}),
    ...overrides,
  } as unknown as UploaderDeps;
}

function collectStatuses() {
  const statuses: Array<{ status: string; error?: string }> = [];
  return {
    statuses,
    cb: {
      onProgress: vi.fn(),
      onStatus: (status: string, error?: string) => {
        statuses.push({ status, error });
      },
    },
  };
}

describe("FileUploader — single PUT mode", () => {
  it("uploads small files with one PUT and completes without uploadId", async () => {
    const deps = makeDeps({
      createUpload: vi.fn(async () => ({
        mode: "single" as const,
        url: "https://signed/put",
      })),
    });
    const { statuses, cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(5), target, deps, cb);

    await uploader.start();

    expect(deps.putBlob).toHaveBeenCalledTimes(1);
    expect(deps.completeUpload).toHaveBeenCalledWith({ ...target });
    expect(statuses.map((s) => s.status)).toEqual(["uploading", "completed"]);
  });
});

describe("FileUploader — multipart mode", () => {
  it("uploads all parts and completes with ordered part list", async () => {
    let counter = 0;
    const deps = makeDeps({
      putBlob: vi.fn(async () => ({ etag: `etag-${++counter}` })),
    });
    const { statuses, cb } = collectStatuses();
    // 10 bytes / partSize 4 => 3 parts
    const uploader = new FileUploader(makeFile(10), target, deps, cb);

    await uploader.start();

    expect(deps.putBlob).toHaveBeenCalledTimes(3);
    const completeArgs = (deps.completeUpload as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(completeArgs.uploadId).toBe("up-1");
    expect(completeArgs.parts.map((p: { partNumber: number }) => p.partNumber)).toEqual([1, 2, 3]);
    expect(completeArgs.parts.every((p: { etag: string }) => p.etag.startsWith("etag-"))).toBe(true);
    expect(statuses.at(-1)?.status).toBe("completed");
  });

  it("slices the file into correct part blobs", async () => {
    const blobs: Blob[] = [];
    const deps = makeDeps({
      putBlob: vi.fn(async (_url: string, blob: Blob) => {
        blobs.push(blob);
        return { etag: "e" };
      }),
    });
    const { cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(10), target, deps, cb);
    await uploader.start();
    const sizes = blobs.map((b) => b.size).sort((a, b) => a - b);
    expect(sizes).toEqual([2, 4, 4]); // 4 + 4 + 2 = 10
  });

  it("retries a failed part and succeeds", async () => {
    let attempt = 0;
    const deps = makeDeps({
      putBlob: vi.fn(async () => {
        attempt++;
        if (attempt === 1) throw new Error("transient");
        return { etag: `etag-${attempt}` };
      }),
    });
    const { statuses, cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(4), target, deps, cb);
    await uploader.start();
    expect(deps.putBlob).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)?.status).toBe("completed");
  });

  it("fails with an error status after exhausting part retries", async () => {
    const deps = makeDeps({
      putBlob: vi.fn(async () => {
        throw new Error("hard failure");
      }),
    });
    const { statuses, cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(4), target, deps, cb);
    await uploader.start();
    expect(deps.putBlob).toHaveBeenCalledTimes(3);
    expect(statuses.at(-1)).toEqual({ status: "error", error: "hard failure" });
  });

  it("reports a CORS-specific error when S3 returns no ETag", async () => {
    const deps = makeDeps({
      putBlob: vi.fn(async () => ({ etag: null })),
    });
    const { statuses, cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(4), target, deps, cb);
    await uploader.start();
    expect(statuses.at(-1)?.status).toBe("error");
    expect(statuses.at(-1)?.error).toContain("ExposeHeaders");
  });

  it("pause keeps completed parts; resume uploads only the remainder", async () => {
    const { putBlob, pending } = makeControlledPut();
    const deps = makeDeps({ putBlob: putBlob as unknown as UploaderDeps["putBlob"] });
    const { statuses, cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(10), target, deps, cb);

    const run = uploader.start();
    await flush();
    expect(pending.length).toBe(3); // all 3 parts in flight (concurrency 4)

    pending[0].resolve("etag-1"); // part 1 finishes
    await flush();

    uploader.pause();
    await run;
    expect(statuses.at(-1)?.status).toBe("paused");

    // Resume: only parts 2 and 3 remain.
    const resumed = uploader.start();
    await flush();
    expect(pending.length).toBe(5); // 3 original + 2 resumed
    pending[3].resolve("etag-2");
    pending[4].resolve("etag-3");
    await resumed;

    expect(statuses.at(-1)?.status).toBe("completed");
    const completeArgs = (deps.completeUpload as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(completeArgs.parts).toHaveLength(3);
    // createUpload must NOT be called again on resume
    expect(deps.createUpload).toHaveBeenCalledTimes(1);
  });

  it("cancel aborts the remote multipart upload and reports canceled", async () => {
    const { putBlob, pending } = makeControlledPut();
    const deps = makeDeps({ putBlob: putBlob as unknown as UploaderDeps["putBlob"] });
    const { statuses, cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(10), target, deps, cb);

    const run = uploader.start();
    await flush();
    expect(pending.length).toBe(3);

    await uploader.cancel();
    await run;

    expect(deps.abortUpload).toHaveBeenCalledWith({ ...target, uploadId: "up-1" });
    expect(statuses.at(-1)?.status).toBe("canceled");
    expect(deps.completeUpload).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/uploads/uploader.test.ts`
Expected: FAIL — cannot find module `./uploader`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/uploads/uploader.ts
import { computePartCount } from "./part-math";
import type { CompletedPart, CreateUploadResponse, UploadTarget } from "./types";

export type UploaderStatus =
  | "uploading"
  | "paused"
  | "completed"
  | "error"
  | "canceled";

export interface UploaderCallbacks {
  onProgress: (loadedBytes: number) => void;
  onStatus: (status: UploaderStatus, error?: string) => void;
}

export interface UploaderDeps {
  createUpload: (
    params: UploadTarget & { fileSize: number; contentType: string }
  ) => Promise<CreateUploadResponse>;
  signParts: (
    params: UploadTarget & { uploadId: string; partNumbers: number[] }
  ) => Promise<{ urls: Record<number, string> }>;
  putBlob: (
    url: string,
    blob: Blob,
    opts: {
      contentType?: string;
      signal: AbortSignal;
      onProgress: (loadedBytes: number) => void;
    }
  ) => Promise<{ etag: string | null }>;
  completeUpload: (
    params: UploadTarget & { uploadId?: string; parts?: CompletedPart[] }
  ) => Promise<{ success: boolean }>;
  abortUpload: (
    params: UploadTarget & { uploadId: string }
  ) => Promise<void>;
}

const PART_CONCURRENCY = 4;
const PART_ATTEMPTS = 3;
const SIGN_BATCH = 50;

export class FileUploader {
  private created: CreateUploadResponse | null = null;
  private completedParts = new Map<number, string>();
  private partLoaded = new Map<number, number>();
  private abortController: AbortController | null = null;
  private pauseRequested = false;
  private cancelRequested = false;
  private running = false;

  constructor(
    private file: File,
    private target: UploadTarget,
    private deps: UploaderDeps,
    private cb: UploaderCallbacks
  ) {}

  /** Begins the upload, or resumes it after a pause or error. */
  async start(): Promise<void> {
    if (this.running || this.cancelRequested) return;
    this.running = true;
    this.pauseRequested = false;
    this.abortController = new AbortController();
    this.cb.onStatus("uploading");
    try {
      if (!this.created) {
        this.created = await this.deps.createUpload({
          ...this.target,
          fileSize: this.file.size,
          contentType: this.file.type || "application/octet-stream",
        });
      }
      if (this.created.mode === "single") {
        await this.uploadSingle(this.created.url);
        await this.deps.completeUpload({ ...this.target });
      } else {
        await this.uploadParts(this.created.uploadId, this.created.partSize);
        const parts: CompletedPart[] = [...this.completedParts.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([partNumber, etag]) => ({ partNumber, etag }));
        await this.deps.completeUpload({
          ...this.target,
          uploadId: this.created.uploadId,
          parts,
        });
      }
      this.cb.onStatus("completed");
    } catch (err) {
      if (this.cancelRequested) {
        // cancel() reports the canceled status after aborting remotely.
      } else if (this.pauseRequested) {
        this.cb.onStatus("paused");
      } else {
        this.cb.onStatus(
          "error",
          err instanceof Error ? err.message : "Upload failed"
        );
      }
    } finally {
      this.running = false;
    }
  }

  /** Aborts in-flight part uploads; completed parts are kept for resume. */
  pause(): void {
    this.pauseRequested = true;
    this.abortController?.abort();
  }

  /** Aborts in-flight uploads and best-effort aborts the remote multipart upload. */
  async cancel(): Promise<void> {
    this.cancelRequested = true;
    this.abortController?.abort();
    if (this.created?.mode === "multipart") {
      try {
        await this.deps.abortUpload({
          ...this.target,
          uploadId: this.created.uploadId,
        });
      } catch {
        // Best-effort: an orphaned upload remains visible (and abortable)
        // in the bucket's incomplete-uploads tab.
      }
    }
    this.cb.onStatus("canceled");
  }

  private reportProgress(): void {
    let loaded = 0;
    for (const bytes of this.partLoaded.values()) loaded += bytes;
    this.cb.onProgress(Math.min(loaded, this.file.size));
  }

  private async uploadSingle(url: string): Promise<void> {
    // A paused single PUT restarts from zero on resume — there are no parts to keep.
    this.partLoaded.set(0, 0);
    await this.deps.putBlob(url, this.file, {
      contentType: this.file.type || "application/octet-stream",
      signal: this.abortController!.signal,
      onProgress: (bytes) => {
        this.partLoaded.set(0, bytes);
        this.reportProgress();
      },
    });
    this.partLoaded.set(0, this.file.size);
    this.reportProgress();
  }

  private async uploadParts(uploadId: string, partSize: number): Promise<void> {
    const partCount = computePartCount(this.file.size, partSize);
    const pending: number[] = [];
    for (let n = 1; n <= partCount; n++) {
      if (this.completedParts.has(n)) {
        this.partLoaded.set(n, this.partBlob(n, partSize).size);
      } else {
        this.partLoaded.set(n, 0);
        pending.push(n);
      }
    }
    this.reportProgress();

    // Sign lazily in batches so presigned URLs are always fresh, even for
    // uploads that run longer than the 1-hour expiry.
    for (let i = 0; i < pending.length; i += SIGN_BATCH) {
      const batch = pending.slice(i, i + SIGN_BATCH);
      const { urls } = await this.deps.signParts({
        ...this.target,
        uploadId,
        partNumbers: batch,
      });
      await this.runPool(batch, async (partNumber) => {
        const url = urls[partNumber];
        if (!url) {
          throw new Error(`No presigned URL returned for part ${partNumber}`);
        }
        await this.uploadPart(partNumber, url, partSize);
      });
    }
  }

  private partBlob(partNumber: number, partSize: number): Blob {
    const start = (partNumber - 1) * partSize;
    return this.file.slice(start, Math.min(start + partSize, this.file.size));
  }

  private async uploadPart(
    partNumber: number,
    url: string,
    partSize: number
  ): Promise<void> {
    const blob = this.partBlob(partNumber, partSize);
    let lastError: unknown;
    for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt++) {
      try {
        const { etag } = await this.deps.putBlob(url, blob, {
          signal: this.abortController!.signal,
          onProgress: (bytes) => {
            this.partLoaded.set(partNumber, bytes);
            this.reportProgress();
          },
        });
        if (!etag) {
          throw new Error(
            "S3 did not return an ETag for an uploaded part. The bucket's CORS configuration must list ETag under ExposeHeaders (see docs/DIRECT_UPLOADS_CORS.md)."
          );
        }
        this.completedParts.set(partNumber, etag);
        this.partLoaded.set(partNumber, blob.size);
        this.reportProgress();
        return;
      } catch (err) {
        if (this.abortController!.signal.aborted) throw err;
        lastError = err;
        this.partLoaded.set(partNumber, 0);
      }
    }
    throw lastError;
  }

  private async runPool(
    items: number[],
    worker: (item: number) => Promise<void>
  ): Promise<void> {
    const queue = [...items];
    const workers = Array.from(
      { length: Math.min(PART_CONCURRENCY, queue.length) },
      async () => {
        for (;;) {
          const item = queue.shift();
          if (item === undefined) return;
          if (this.abortController!.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          await worker(item);
        }
      }
    );
    await Promise.all(workers);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/uploads/uploader.test.ts`
Expected: PASS — all 9 tests green. If the pause test is flaky around `pending.length`, add one more `await flush()` after `uploader.start()`/`resume` (the pool spawns workers via microtasks + setTimeout-0 is usually enough).

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/uploads/uploader.ts src/lib/uploads/uploader.test.ts
git commit -m "feat(uploads): add FileUploader with parallel parts, retries, pause/resume, cancel"
```

---

### Task 8: Upload store rewrite

**Files:**
- Modify: `src/lib/stores/upload-store.ts` (full rewrite — the current content is dead code with zero external imports)
- Test: `src/lib/stores/upload-store.test.ts`

The store holds plain serializable state only. Uploader instances live in the controller (Task 9), not in the store.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/stores/upload-store.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/stores/upload-store.test.ts`
Expected: FAIL — current store exports `uploads`/`addUpload`, not `items`/`addItem`.

- [ ] **Step 3: Rewrite the store**

Replace the ENTIRE content of `src/lib/stores/upload-store.ts` with:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/stores/upload-store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/upload-store.ts src/lib/stores/upload-store.test.ts
git commit -m "refactor(uploads): rewrite upload store for queue/progress/pause state"
```

---

### Task 9: Upload controller (queue + registry)

**Files:**
- Create: `src/lib/uploads/controller.ts`
- Test: `src/lib/uploads/controller.test.ts`

The controller is the non-React module the UI calls. It owns the uploader registry (non-serializable, so kept out of Zustand), enforces max 3 concurrently uploading files, and pumps the queue whenever a slot frees. It accepts an injectable uploader factory for tests.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/uploads/controller.test.ts
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/uploads/controller.test.ts`
Expected: FAIL — cannot find module `./controller`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/uploads/controller.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/uploads/controller.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/uploads/controller.ts src/lib/uploads/controller.test.ts
git commit -m "feat(uploads): add upload controller with file-level concurrency queue"
```

---

### Task 10: Folder traversal helper

**Files:**
- Create: `src/lib/uploads/folder-walk.ts`
- Test: `src/lib/uploads/folder-walk.test.ts`

Uses the non-standard-but-universal `webkitGetAsEntry()` API for drag-dropped folders. Critical detail: `DirectoryReader.readEntries` returns results in batches (Chrome caps at 100), so it must be called in a loop until it returns an empty array. The traversal logic is typed against minimal structural interfaces so tests can use plain fake objects.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/uploads/folder-walk.test.ts
import { describe, it, expect } from "vitest";
import {
  walkEntry,
  type EntryLike,
  type FileEntryLike,
  type DirectoryEntryLike,
} from "./folder-walk";

function fileEntry(name: string): FileEntryLike {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (cb) => cb(new File([new Uint8Array(1)], name)),
  };
}

function dirEntry(
  name: string,
  children: EntryLike[],
  batchSize = 100
): DirectoryEntryLike {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let offset = 0;
      return {
        readEntries: (cb) => {
          const batch = children.slice(offset, offset + batchSize);
          offset += batch.length;
          cb(batch);
        },
      };
    },
  };
}

describe("walkEntry", () => {
  it("returns a single file with its name as the relative path", async () => {
    const result = await walkEntry(fileEntry("a.txt"));
    expect(result).toHaveLength(1);
    expect(result[0].relativePath).toBe("a.txt");
    expect(result[0].file.name).toBe("a.txt");
  });

  it("walks nested directories, prefixing paths with folder names", async () => {
    const tree = dirEntry("root", [
      fileEntry("a.txt"),
      dirEntry("sub", [fileEntry("b.txt"), dirEntry("deep", [fileEntry("c.txt")])]),
    ]);
    const result = await walkEntry(tree);
    expect(result.map((r) => r.relativePath).sort()).toEqual([
      "root/a.txt",
      "root/sub/b.txt",
      "root/sub/deep/c.txt",
    ].sort());
  });

  it("reads directories larger than one readEntries batch", async () => {
    const children = Array.from({ length: 250 }, (_, i) =>
      fileEntry(`f${i}.txt`)
    );
    const tree = dirEntry("big", children, 100); // batches of 100: 100+100+50
    const result = await walkEntry(tree);
    expect(result).toHaveLength(250);
  });

  it("returns an empty list for an empty directory", async () => {
    const result = await walkEntry(dirEntry("empty", []));
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/uploads/folder-walk.test.ts`
Expected: FAIL — cannot find module `./folder-walk`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/uploads/folder-walk.ts
export interface FileWithPath {
  file: File;
  relativePath: string;
}

// Minimal structural types for the non-standard FileSystem Entry API
// (DataTransferItem.webkitGetAsEntry), so tests can use plain objects.
export interface FileEntryLike {
  isFile: true;
  isDirectory: false;
  name: string;
  file: (cb: (file: File) => void, errCb?: (err: unknown) => void) => void;
}

export interface DirectoryEntryLike {
  isFile: false;
  isDirectory: true;
  name: string;
  createReader: () => DirectoryReaderLike;
}

export interface DirectoryReaderLike {
  readEntries: (
    cb: (entries: EntryLike[]) => void,
    errCb?: (err: unknown) => void
  ) => void;
}

export type EntryLike = FileEntryLike | DirectoryEntryLike;

export async function walkEntry(
  entry: EntryLike,
  prefix = ""
): Promise<FileWithPath[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      entry.file(resolve, reject)
    );
    return [{ file, relativePath: prefix + entry.name }];
  }

  const reader = entry.createReader();
  const children: EntryLike[] = [];
  // readEntries returns results in batches (Chrome caps at 100 per call) —
  // keep reading until it returns an empty array.
  for (;;) {
    const batch = await new Promise<EntryLike[]>((resolve, reject) =>
      reader.readEntries(resolve, reject)
    );
    if (batch.length === 0) break;
    children.push(...batch);
  }

  const results: FileWithPath[] = [];
  for (const child of children) {
    results.push(...(await walkEntry(child, prefix + entry.name + "/")));
  }
  return results;
}

/**
 * Extracts files (with folder-relative paths) from a drop event's DataTransfer.
 * Entry handles must be captured synchronously — they are only valid during
 * the drop event — which this function does before any await.
 */
export async function filesFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<FileWithPath[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .filter((item) => item.kind === "file")
    .map((item) =>
      typeof item.webkitGetAsEntry === "function"
        ? (item.webkitGetAsEntry() as unknown as EntryLike | null)
        : null
    );

  if (entries.length === 0 || entries.every((e) => e === null)) {
    // Fallback for browsers without the entries API: flat file list.
    return Array.from(dataTransfer.files ?? []).map((file) => ({
      file,
      relativePath: file.name,
    }));
  }

  const results: FileWithPath[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    results.push(...(await walkEntry(entry)));
  }
  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/uploads/folder-walk.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/uploads/folder-walk.ts src/lib/uploads/folder-walk.test.ts
git commit -m "feat(uploads): add folder traversal for drag-dropped directories"
```

---

### Task 11: Upload Manager panel

**Files:**
- Create: `src/components/browser/upload-manager.tsx`
- Modify: `src/app/app/layout.tsx`

A floating panel (bottom-LEFT; the notifications panel already occupies `fixed bottom-4 right-4`). Shows per-file progress with pause/resume/cancel/retry/remove controls and a "Clear finished" header action. Renders nothing when there are no uploads.

- [ ] **Step 1: Write the component**

```tsx
// src/components/browser/upload-manager.tsx
"use client";

import { useUploadStore, type UploadItem } from "@/lib/stores/upload-store";
import {
  pauseUpload,
  resumeUpload,
  cancelUpload,
  removeUpload,
  clearFinishedUploads,
} from "@/lib/uploads/controller";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";
import {
  Pause,
  Play,
  X,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Upload,
} from "lucide-react";

function ItemControls({ item }: { item: UploadItem }) {
  switch (item.status) {
    case "uploading":
      return (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => pauseUpload(item.id)}
            title="Pause"
          >
            <Pause className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => cancelUpload(item.id)}
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      );
    case "queued":
      return (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => cancelUpload(item.id)}
          title="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      );
    case "paused":
      return (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => resumeUpload(item.id)}
            title="Resume"
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => cancelUpload(item.id)}
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      );
    case "error":
      return (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => resumeUpload(item.id)}
            title="Retry"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => removeUpload(item.id)}
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      );
    default: // completed | canceled
      return (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => removeUpload(item.id)}
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      );
  }
}

function StatusIcon({ status }: { status: UploadItem["status"] }) {
  if (status === "completed")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />;
  if (status === "error")
    return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />;
  return <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function statusLabel(item: UploadItem): string {
  switch (item.status) {
    case "queued":
      return "Queued";
    case "uploading":
      return `${formatBytes(item.loaded)} / ${formatBytes(item.size)}`;
    case "paused":
      return `Paused — ${formatBytes(item.loaded)} / ${formatBytes(item.size)}`;
    case "completed":
      return formatBytes(item.size);
    case "canceled":
      return "Canceled";
    case "error":
      return item.error ?? "Upload failed";
  }
}

export function UploadManager() {
  const items = useUploadStore((state) => state.items);

  if (items.length === 0) return null;

  const activeCount = items.filter(
    (i) => i.status === "uploading" || i.status === "queued"
  ).length;
  const hasFinished = items.some(
    (i) =>
      i.status === "completed" ||
      i.status === "error" ||
      i.status === "canceled"
  );

  return (
    <div className="fixed bottom-4 left-4 z-50 w-96 rounded-lg border bg-background shadow-lg">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="text-sm font-medium">
          Uploads{activeCount > 0 ? ` (${activeCount} active)` : ""}
        </p>
        {hasFinished && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={clearFinishedUploads}
          >
            Clear finished
          </Button>
        )}
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto p-2">
        {items.map((item) => {
          const percent =
            item.size > 0
              ? Math.round((item.loaded / item.size) * 100)
              : item.status === "completed"
                ? 100
                : 0;
          return (
            <div key={item.id} className="rounded-md px-2 py-1.5 hover:bg-muted/50">
              <div className="flex items-center gap-2">
                <StatusIcon status={item.status} />
                <span className="min-w-0 flex-1 truncate text-sm" title={item.key}>
                  {item.fileName}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <ItemControls item={item} />
                </div>
              </div>
              {(item.status === "uploading" || item.status === "paused") && (
                <Progress value={percent} className="mt-1.5 h-1.5" />
              )}
              <p
                className={`mt-1 truncate text-xs ${
                  item.status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
                title={item.status === "error" ? item.error : undefined}
              >
                {statusLabel(item)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Note for the implementer: check `src/components/ui/progress.tsx` and `src/components/ui/button.tsx` for their exact prop APIs before using (shadcn-style `Progress` takes `value: number` 0–100 and `className`; `Button` supports `variant`/`size`). Adjust if they differ.

- [ ] **Step 2: Mount the panel in the dashboard layout**

In `src/app/app/layout.tsx`, add the import and mount it next to `<Notifications />`:

```tsx
import { UploadManager } from "@/components/browser/upload-manager";
```

and in the JSX (after `<Notifications />`):

```tsx
      <Notifications />
      <UploadManager />
```

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/browser/upload-manager.tsx src/app/app/layout.tsx
git commit -m "feat(uploads): add upload manager panel with pause/resume/cancel controls"
```

---

### Task 12: Rewire upload-zone to direct uploads + folder support

**Files:**
- Modify: `src/components/browser/upload-zone.tsx` (full rewrite)
- Modify: `src/components/browser/file-browser.tsx` (add `UploadFolderButton` next to `UploadButton`, ~line 506)

Both old components POSTed FormData to `/api/objects/upload` per file with a notification per file. The rewrite enqueues into the controller instead (progress lives in the Upload Manager panel — no more per-file notifications, which would spam on folder drops). Drag-drop now traverses folders; a new "Upload folder" button uses `webkitdirectory`.

Query invalidation: files can land in NEW subfolders (folder upload), so invalidate the whole bucket's object listings — partial key `[...queryKeys.objects.all, connectionId, bucket]` matches every prefix of `queryKeys.objects.list(connectionId, bucket, prefix)`.

- [ ] **Step 1: Rewrite the file**

Replace the ENTIRE content of `src/components/browser/upload-zone.tsx` with:

```tsx
"use client";

import { useCallback, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries/keys";
import { Button } from "@/components/ui/button";
import { enqueueUploads } from "@/lib/uploads/controller";
import {
  filesFromDataTransfer,
  type FileWithPath,
} from "@/lib/uploads/folder-walk";
import { Upload, FolderUp } from "lucide-react";

interface UploadZoneProps {
  connectionId: string;
  bucket: string;
  currentPath: string;
  disabled?: boolean;
}

function useEnqueueFiles(
  connectionId: string,
  bucket: string,
  currentPath: string
) {
  const queryClient = useQueryClient();
  return useCallback(
    (files: FileWithPath[]) => {
      if (files.length === 0) return;
      enqueueUploads(
        files.map(({ file, relativePath }) => ({
          file,
          connectionId,
          bucket,
          key: currentPath + relativePath,
          onComplete: () =>
            queryClient.invalidateQueries({
              // Folder uploads can create new prefixes, so invalidate all
              // object listings for this bucket.
              queryKey: [...queryKeys.objects.all, connectionId, bucket],
            }),
        }))
      );
    },
    [connectionId, bucket, currentPath, queryClient]
  );
}

export function UploadZone({
  connectionId,
  bucket,
  currentPath,
  disabled = false,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const enqueueFiles = useEnqueueFiles(connectionId, bucket, currentPath);

  const isExternalFileDrag = useCallback((e: DragEvent): boolean => {
    if (!e.dataTransfer) return false;
    const types = Array.from(e.dataTransfer.types);
    return types.includes("Files") && !types.includes("application/x-s3-objects");
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (!isExternalFileDrag(e) || !e.dataTransfer) return;

      // filesFromDataTransfer captures entry handles synchronously (required —
      // they expire with the event), then traverses folders asynchronously.
      void filesFromDataTransfer(e.dataTransfer).then(enqueueFiles);
    },
    [enqueueFiles, isExternalFileDrag]
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
    },
    [isExternalFileDrag]
  );

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    },
    [isExternalFileDrag]
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.relatedTarget === null) {
      setIsDragging(false);
    }
  }, []);

  useEffect(() => {
    if (disabled) return;

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop, disabled]);

  return (
    <>
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-8">
          <div className="w-full h-full border border-dashed border-muted-foreground/50 rounded-lg flex flex-col items-center justify-center bg-white dark:bg-zinc-950">
            <Upload className="h-16 w-16 mb-4 text-primary" />
            <p className="text-xl font-medium text-primary">
              Drop files or folders to upload
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Uploads go to the current folder
            </p>
          </div>
        </div>
      )}
    </>
  );
}

interface UploadButtonProps {
  connectionId: string;
  bucket: string;
  currentPath: string;
  disabled?: boolean;
}

export function UploadButton({
  connectionId,
  bucket,
  currentPath,
  disabled = false,
}: UploadButtonProps) {
  const enqueueFiles = useEnqueueFiles(connectionId, bucket, currentPath);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      const files: FileWithPath[] = Array.from(e.target.files || []).map(
        (file) => ({ file, relativePath: file.name })
      );
      enqueueFiles(files);
      e.target.value = "";
    },
    [enqueueFiles, disabled]
  );

  return (
    <label>
      <input
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />
      <Button asChild disabled={disabled}>
        <span>
          <Upload className="h-4 w-4" />
          Upload file
        </span>
      </Button>
    </label>
  );
}

export function UploadFolderButton({
  connectionId,
  bucket,
  currentPath,
  disabled = false,
}: UploadButtonProps) {
  const enqueueFiles = useEnqueueFiles(connectionId, bucket, currentPath);

  const handleFolderSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      const files: FileWithPath[] = Array.from(e.target.files || []).map(
        (file) => ({
          // webkitRelativePath is "pickedFolder/sub/file.txt" — keep the
          // folder name so the structure lands under the current path.
          file,
          relativePath: file.webkitRelativePath || file.name,
        })
      );
      enqueueFiles(files);
      e.target.value = "";
    },
    [enqueueFiles, disabled]
  );

  return (
    <label>
      <input
        type="file"
        multiple
        // Non-standard but universally supported attribute for folder pickers.
        {...{ webkitdirectory: "" }}
        onChange={handleFolderSelect}
        className="hidden"
        disabled={disabled}
      />
      <Button asChild variant="outline" disabled={disabled}>
        <span>
          <FolderUp className="h-4 w-4" />
          Upload folder
        </span>
      </Button>
    </label>
  );
}
```

TypeScript note: if `{...{ webkitdirectory: "" }}` raises a JSX type error, use `webkitdirectory=""` with a `// @ts-expect-error non-standard attribute` comment, or extend via `React.InputHTMLAttributes` cast — pick whichever lints clean.

- [ ] **Step 2: Add the folder button to the file browser toolbar**

In `src/components/browser/file-browser.tsx`:
1. Change the import on line 21 to include the new button:

```tsx
import { UploadZone, UploadButton, UploadFolderButton } from "./upload-zone";
```

2. Inside the existing `CapabilityGate` for `upload-objects` (~line 505), add the folder button right after `<UploadButton ... />`:

```tsx
          <CapabilityGate connectionId={connectionId} bucket={bucket} capability="upload-objects">
            <UploadButton
              connectionId={connectionId}
              bucket={bucket}
              currentPath={currentPath}
              disabled={!canWrite}
            />
            <UploadFolderButton
              connectionId={connectionId}
              bucket={bucket}
              currentPath={currentPath}
              disabled={!canWrite}
            />
          </CapabilityGate>
```

(Match the surrounding indentation/structure exactly as found in the file; only the `UploadFolderButton` block is new.)

- [ ] **Step 3: Lint and run the full test suite**

Run: `pnpm lint && pnpm test`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/browser/upload-zone.tsx src/components/browser/file-browser.tsx
git commit -m "feat(uploads): direct-to-S3 uploads from upload zone with folder support"
```

---

### Task 13: Remove legacy upload route, CORS docs, final verification

**Files:**
- Delete: `src/app/api/objects/upload/route.ts`
- Create: `docs/DIRECT_UPLOADS_CORS.md`

- [ ] **Step 1: Verify nothing references the legacy route anymore**

Run: `pnpm exec grep -r "api/objects/upload" src/ --include=*.ts --include=*.tsx` (or use ripgrep/Grep tool: pattern `api/objects/upload` in `src/`)
Expected: no matches (the only callers were in `upload-zone.tsx`, rewritten in Task 12). If matches exist, STOP and fix the caller first.

- [ ] **Step 2: Delete the legacy route**

```bash
git rm src/app/api/objects/upload/route.ts
```

- [ ] **Step 3: Write the CORS documentation**

```markdown
<!-- docs/DIRECT_UPLOADS_CORS.md -->
# Bucket CORS configuration for direct uploads

Uploads go directly from the browser to your S3-compatible endpoint using
presigned URLs. The target bucket must allow cross-origin PUTs from the app's
origin and must expose the `ETag` response header (multipart completion needs
the ETag of every uploaded part).

If uploads fail immediately with a network error, or fail with an error
mentioning `ExposeHeaders`, this configuration is missing.

## AWS S3

Bucket → Permissions → Cross-origin resource sharing (CORS):

```json
[
  {
    "AllowedOrigins": ["https://your-app-domain.example"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Add `http://localhost:3000` to `AllowedOrigins` for local development.

## MinIO

MinIO responds to CORS preflights permissively by default for presigned URLs,
but if you have restricted it, allow the app origin:

```bash
mc admin config set myminio api cors_allow_origin="https://your-app-domain.example"
mc admin service restart myminio
```

## Notes

- `GET`/`HEAD` are not required for uploads; add them only if you also serve
  objects to the browser via presigned GETs from another origin.
- Incomplete multipart uploads (e.g. canceled mid-flight with a failed abort,
  or a closed tab) are listed in the bucket's "Incomplete uploads" tab in this
  app, where they can be aborted to stop storage charges. Consider an S3
  lifecycle rule (`AbortIncompleteMultipartUpload`) as a safety net.
```

- [ ] **Step 4: Full verification**

Run: `pnpm lint`
Expected: passes.

Run: `pnpm test`
Expected: all tests pass.

Run: `pnpm build`
Expected: production build succeeds (this catches type errors across the new routes/components).

- [ ] **Step 5: Commit**

```bash
git add docs/DIRECT_UPLOADS_CORS.md
git commit -m "feat(uploads): remove legacy server-buffered upload route, document bucket CORS"
```

---

## Manual smoke test (post-implementation, optional but recommended)

With `pnpm dev` and a MinIO/S3 connection configured:
1. Drop a small file (< 8 MiB) → appears in Upload Manager, completes via single PUT, file list refreshes, activity log shows UPLOAD.
2. Drop a file > 8 MiB → multipart path; progress bar advances; pause → status Paused; resume → completes.
3. Cancel mid-upload → item shows Canceled; bucket's "Incomplete uploads" tab shows nothing orphaned (abort succeeded).
4. Drop a folder with nested subfolders → all files upload with prefixed keys; new subfolders appear after refresh.
5. "Upload folder" button → same result via picker.
6. FREE-tier file-size limit: a file over the tier limit fails at create with the upgrade message shown on the item.
